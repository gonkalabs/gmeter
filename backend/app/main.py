from contextlib import asynccontextmanager
import threading

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.api import brokers, metrics, runs
from app.config import settings
from app.database import Base, SessionLocal, engine
from app.models import Broker, ProbeRun
from app.services.model_catalog import configured_broker_specs
from app.services.runner import run_probe_suite


def migrate_schema():
    inspector = inspect(engine)
    if "probe_runs" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("probe_runs")}
    if "run_type" not in columns:
        with engine.connect() as conn:
            conn.execute(
                text("ALTER TABLE probe_runs ADD COLUMN run_type VARCHAR(32) DEFAULT 'quick'")
            )
            conn.commit()

    with engine.connect() as conn:
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_probe_runs_latest "
                "ON probe_runs (broker_id, status, run_type, finished_at DESC)"
            )
        )
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_probe_results_run_id ON probe_results (run_id)")
        )
        conn.commit()

    if "brokers" not in inspector.get_table_names():
        return
    broker_columns = {c["name"] for c in inspector.get_columns("brokers")}
    if "model_aliases" not in broker_columns:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE brokers ADD COLUMN model_aliases JSON DEFAULT '{}'"))
            conn.commit()


def normalize_base_url(url: str) -> str:
    return url.rstrip("/").lower()


def seed_default_brokers():
    db = SessionLocal()
    try:
        specs, config_authoritative = configured_broker_specs()
        all_brokers = db.query(Broker).order_by(Broker.id).all()
        by_url: dict[str, list[Broker]] = {}
        by_name = {
            broker.name: broker
            for broker in all_brokers
            if broker.name and not broker.name.startswith("__archived__")
        }
        for broker in all_brokers:
            by_url.setdefault(normalize_base_url(broker.base_url), []).append(broker)

        for spec in specs:
            key = normalize_base_url(spec.base_url)
            matches = by_url.get(key, [])
            if not matches:
                continue
            for duplicate in matches[1:]:
                duplicate.enabled = False
                duplicate.name = f"__archived__{duplicate.id}"

        db.flush()

        for spec in specs:
            key = normalize_base_url(spec.base_url)
            matches = by_url.get(key, [])
            if not matches and spec.name in by_name:
                matches = [by_name[spec.name]]
            spec_models = spec.models_csv or settings.default_models
            if matches:
                canonical = matches[0]
                canonical.name = spec.name
                canonical.base_url = spec.base_url
                canonical.api_key = spec.api_key
                canonical.enabled = spec.enabled
                if config_authoritative or not canonical.models:
                    canonical.models = spec_models
                if config_authoritative or not canonical.model_aliases:
                    canonical.model_aliases = spec.model_aliases
                continue

            broker = Broker(
                name=spec.name,
                base_url=spec.base_url,
                api_key=spec.api_key,
                models=spec_models,
                model_aliases=spec.model_aliases,
                enabled=spec.enabled,
            )
            db.add(broker)
            by_url.setdefault(key, []).append(broker)

        db.commit()
    finally:
        db.close()


def scheduled_probe(mode: str = "quick"):
    db = SessionLocal()
    try:
        for broker in db.query(Broker).filter(Broker.enabled.is_(True)).all():
            try:
                run_probe_suite(db, broker, mode=mode)
            except Exception:
                pass
    finally:
        db.close()


scheduler = BackgroundScheduler()


def startup_probe():
    db = SessionLocal()
    try:
        for broker in db.query(Broker).filter(Broker.enabled.is_(True)).all():
            has_quick = (
                db.query(ProbeRun)
                .filter(
                    ProbeRun.broker_id == broker.id,
                    ProbeRun.status == "completed",
                    ProbeRun.run_type == "quick",
                )
                .count()
                > 0
            )
            if has_quick:
                continue
            try:
                run_probe_suite(db, broker, mode="quick")
            except Exception:
                pass
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    migrate_schema()
    seed_default_brokers()
    scheduler.add_job(
        lambda: scheduled_probe("quick"),
        "interval",
        minutes=settings.probe_interval_minutes,
        id="probe_quick",
        replace_existing=True,
    )
    scheduler.add_job(
        lambda: scheduled_probe("limits"),
        "interval",
        minutes=settings.limits_interval_minutes,
        id="probe_limits",
        replace_existing=True,
    )
    scheduler.start()
    if settings.run_probe_on_startup:
        threading.Thread(target=startup_probe, daemon=True).start()
    if settings.run_limits_on_startup:
        threading.Thread(target=lambda: scheduled_probe("limits"), daemon=True).start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="G-Meter", description="Gonka API broker observability", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(brokers.router, prefix="/api")
app.include_router(runs.router, prefix="/api")
app.include_router(metrics.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
