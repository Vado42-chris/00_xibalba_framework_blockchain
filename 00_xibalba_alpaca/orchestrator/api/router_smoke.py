from fastapi import APIRouter
from typing import Any, Dict

router = APIRouter()

@router.post("/api/setup/init")
async def init_setup(payload: Dict[str, Any]):
    return {"ok": True, "action": "init", "payload": payload}

@router.post("/api/repair/rebuild")
async def repair_rebuild(payload: Dict[str, Any]):
    return {"ok": True, "action": "repair", "payload": payload}
