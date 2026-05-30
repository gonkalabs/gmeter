import threading

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.deps import require_admin
from app.database import SessionLocal, get_db
from app.models import Broker, ProbeRun
from app.schemas import ProbeResultOut, ProbeRunOut, RunRequest
from app.services.runner import run_probe_suite

router = APIRouter(prefix="/runs", tags=["runs"])


def _run_in_background(
    run_id: int, broker_id: int, models: list[str] | None, mode: str
):
    db = SessionLocal()
    run = None
    try:
        broker = db.get(Broker, broker_id)
        run = db.get(ProbeRun, run_id)
        if not broker or not run:
            return
        run.status = "running"
        db.commit()
        run_probe_suite(db, broker, models=models, mode=mode, existing_run=run)
    except Exception as e:
        if run:
            run.status = "failed"
            run.error = str(e)[:500]
            db.commit()
    finally:
        db.close()


@router.get("", response_model=list[ProbeRunOut])
def list_runs(
    broker_id: int | None = None,
    run_type: str | None = None,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    q = (
        db.query(ProbeRun)
        .options(joinedload(ProbeRun.results))
        .order_by(ProbeRun.started_at.desc())
    )
    if broker_id:
        q = q.filter(ProbeRun.broker_id == broker_id)
    if run_type:
        q = q.filter(ProbeRun.run_type == run_type)
    runs = q.limit(limit).all()
    return [_to_out(r) for r in runs]


@router.get("/{run_id}", response_model=ProbeRunOut)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = (
        db.query(ProbeRun)
        .options(joinedload(ProbeRun.results))
        .filter(ProbeRun.id == run_id)
        .first()
    )
    if not run:
        raise HTTPException(404, "Run not found")
    return _to_out(run)


@router.post("/broker/{broker_id}", response_model=ProbeRunOut, status_code=202)
def start_run(
    broker_id: int,
    body: RunRequest | None = None,
    background: BackgroundTasks = None,
    db: Session = Depends(get_db),
    sync: bool = False,
):
    require_admin()
    broker = db.get(Broker, broker_id)
    if not broker:
        raise HTTPException(404, "Broker not found")
    if not broker.enabled:
        raise HTTPException(400, "Broker is disabled")

    req = body or RunRequest()
    mode = req.mode or ("quick" if req.quick else "full")
    if sync or mode in ("quick", "limits"):
        run = run_probe_suite(db, broker, models=req.models, mode=mode)
        return _to_out(run)

    run = ProbeRun(broker_id=broker.id, status="queued", run_type=mode)
    db.add(run)
    db.commit()
    db.refresh(run)

    thread = threading.Thread(
        target=_run_in_background,
        args=(run.id, broker_id, req.models, mode),
        daemon=True,
    )
    thread.start()
    return _to_out(run)


def _to_out(run: ProbeRun) -> ProbeRunOut:
    return ProbeRunOut(
        id=run.id,
        broker_id=run.broker_id,
        run_type=run.run_type,
        status=run.status,
        started_at=run.started_at,
        finished_at=run.finished_at,
        error=run.error,
        summary=run.summary,
        results=[
            ProbeResultOut(
                id=r.id,
                model=r.model,
                test_name=r.test_name,
                ok=r.ok,
                latency_s=r.latency_s,
                ttft_s=r.ttft_s,
                tps=r.tps,
                stream_tps=r.stream_tps,
                tokens_in=r.tokens_in,
                tokens_out=r.tokens_out,
                detail=r.detail,
                error=r.error,
                gonka_limitation=r.gonka_limitation,
            )
            for r in (run.results or [])
        ],
    )
