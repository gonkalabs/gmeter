from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import (
    DashboardDetail,
    DashboardMetrics,
    LimitsDetail,
    MeasurementLog,
    PricingComparison,
)
from app.services.competitor_pricing import get_pricing_comparison
from app.services.dashboard_detail import get_dashboard_detail, get_metric_logs
from app.services.limits import get_limits_detail
from app.services.metrics import get_dashboard_metrics

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/dashboard", response_model=DashboardMetrics)
def dashboard(broker_id: int | None = None, db: Session = Depends(get_db)):
    return get_dashboard_metrics(db, broker_id)


@router.get("/dashboard/detail", response_model=DashboardDetail)
def dashboard_detail(broker_id: int | None = None, db: Session = Depends(get_db)):
    return get_dashboard_detail(db, broker_id)


@router.get("/dashboard/logs", response_model=list[MeasurementLog])
def dashboard_metric_logs(
    broker_id: int,
    metric_key: str,
    model: str | None = None,
    db: Session = Depends(get_db),
):
    return get_metric_logs(db, broker_id=broker_id, metric_key=metric_key, model=model)


@router.get("/limits", response_model=LimitsDetail)
def limits_detail(db: Session = Depends(get_db)):
    return get_limits_detail(db)


@router.get("/pricing/comparison", response_model=PricingComparison)
def pricing_comparison():
    return get_pricing_comparison()
