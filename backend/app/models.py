from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Broker(Base):
    __tablename__ = "brokers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    base_url: Mapped[str] = mapped_column(String(512))
    api_key: Mapped[str] = mapped_column(Text)
    models: Mapped[str] = mapped_column(Text, default="")
    model_aliases: Mapped[dict] = mapped_column(JSON, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    runs: Mapped[list["ProbeRun"]] = relationship(back_populates="broker", cascade="all, delete")


class ProbeRun(Base):
    __tablename__ = "probe_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    broker_id: Mapped[int] = mapped_column(ForeignKey("brokers.id"))
    status: Mapped[str] = mapped_column(String(32), default="running")
    run_type: Mapped[str] = mapped_column(String(32), default="quick")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    broker: Mapped["Broker"] = relationship(back_populates="runs")
    results: Mapped[list["ProbeResult"]] = relationship(
        back_populates="run", cascade="all, delete"
    )


class ProbeResult(Base):
    __tablename__ = "probe_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("probe_runs.id"))
    model: Mapped[str] = mapped_column(String(256))
    test_name: Mapped[str] = mapped_column(String(64))
    ok: Mapped[bool] = mapped_column(Boolean, default=False)
    latency_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    ttft_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    tps: Mapped[float | None] = mapped_column(Float, nullable=True)
    stream_tps: Mapped[float | None] = mapped_column(Float, nullable=True)
    tokens_in: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    gonka_limitation: Mapped[bool] = mapped_column(Boolean, default=False)

    run: Mapped["ProbeRun"] = relationship(back_populates="results")
