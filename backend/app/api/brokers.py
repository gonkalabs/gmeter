from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.deps import require_admin
from app.database import get_db
from app.models import Broker, ProbeRun
from app.schemas import BrokerCreate, BrokerOut, BrokerUpdate
from app.services.runner import mask_api_key

router = APIRouter(prefix="/brokers", tags=["brokers"])


def _to_out(broker: Broker) -> BrokerOut:
    return BrokerOut(
        id=broker.id,
        name=broker.name,
        base_url=broker.base_url,
        api_key_masked=mask_api_key(broker.api_key),
        models=broker.models,
        model_aliases=broker.model_aliases or {},
        enabled=broker.enabled,
        created_at=broker.created_at,
    )


@router.get("", response_model=list[BrokerOut])
def list_brokers(db: Session = Depends(get_db)):
    return [_to_out(b) for b in db.query(Broker).order_by(Broker.name).all()]


@router.post("", response_model=BrokerOut, status_code=201)
def create_broker(payload: BrokerCreate, db: Session = Depends(get_db)):
    require_admin()
    if db.query(Broker).filter(Broker.name == payload.name).first():
        raise HTTPException(409, "Broker name already exists")
    broker = Broker(**payload.model_dump())
    db.add(broker)
    db.commit()
    db.refresh(broker)
    return _to_out(broker)


@router.get("/{broker_id}", response_model=BrokerOut)
def get_broker(broker_id: int, db: Session = Depends(get_db)):
    broker = db.get(Broker, broker_id)
    if not broker:
        raise HTTPException(404, "Broker not found")
    return _to_out(broker)


@router.patch("/{broker_id}", response_model=BrokerOut)
def update_broker(
    broker_id: int, payload: BrokerUpdate, db: Session = Depends(get_db)
):
    require_admin()
    broker = db.get(Broker, broker_id)
    if not broker:
        raise HTTPException(404, "Broker not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(broker, key, value)
    db.commit()
    db.refresh(broker)
    return _to_out(broker)


@router.delete("/{broker_id}", status_code=204)
def delete_broker(broker_id: int, db: Session = Depends(get_db)):
    require_admin()
    broker = db.get(Broker, broker_id)
    if not broker:
        raise HTTPException(404, "Broker not found")
    db.delete(broker)
    db.commit()
