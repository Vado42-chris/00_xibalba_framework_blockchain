#!/usr/bin/env python3
"""
Orchestrator API (extended)

This FastAPI app is a minimal control-plane prototype for local testing.
It provides:
 - job enqueueing and inspection endpoints
 - worker-friendly endpoints to claim jobs, stream logs, and mark completion

Worker endpoints added:
 - POST /workers/claim            -> atomically claim the oldest PENDING job
 - POST /jobs/{job_id}/append    -> append log lines (stream) for a job
 - POST /jobs/{job_id}/complete  -> mark job as SUCCESS or FAILED and attach result

Security note: This is a prototype. In production you MUST add authentication,
authorization, claim TTLs, re-queue semantics for crashed workers, and proper
isolation for executing untrusted code.
"""

from __future__ import annotations

import asyncio
import datetime
import json
import logging
import os
import uuid
from enum import Enum
from typing import Dict, List, Optional

from fastapi import BackgroundTasks, Body, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

# Configure basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("orchestrator.api.worker")

# Worker secret for authenticating workers; if unset, worker auth is disabled (dev convenience)
WORKER_SECRET = os.environ.get("WORKER_SECRET")


def _validate_worker_secret(provided: Optional[str]) -> bool:
    # If no secret configured, allow all (dev mode)
    if not WORKER_SECRET:
        return True
    return (provided or "") == WORKER_SECRET


app = FastAPI(title="Xibalba Orchestrator (Skeleton w/ Workers)", version="0.2.0")


# -----------------------
# Domain models
# -----------------------
class JobState(str, Enum):
    PENDING = "PENDING"
    CLAIMED = "CLAIMED"  # claimed by a worker, about to run
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    CANCELED = "CANCELED"


class JobRequest(BaseModel):
    repo: str = Field(..., description="GitHub repo in owner/repo format")
    ref: str = Field(..., description="Ref to build (branch, tag, or commit)")
    runtime: str = Field(
        "container", description="Runtime to execute job: container|wasm|microvm"
    )
    command: List[str] = Field(
        ...,
        description="Command array to run (e.g. ['npm','--prefix','client','run','build'])",
    )
    env: Optional[Dict[str, str]] = Field(
        default_factory=dict, description="Environment variables"
    )
    timeout_seconds: Optional[int] = Field(
        900, description="Execution timeout in seconds"
    )
    resource_limits: Optional[Dict[str, int]] = Field(
        default_factory=lambda: {"cpu": 1, "memory_mb": 1024}
    )


class JobSummary(BaseModel):
    job_id: str
    created_at: datetime.datetime
    state: JobState
    repo: str
    ref: str
    runtime: str


class JobDetails(JobSummary):
    command: List[str]
    env: Dict[str, str]
    timeout_seconds: int
    resource_limits: Dict[str, int]
    logs: List[str]
    result: Optional[Dict] = None
    worker_id: Optional[str] = None
    claimed_at: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None


# Worker models
class ClaimRequest(BaseModel):
    worker_id: str
    runtime_pref: Optional[str] = None  # prefer jobs for this runtime


class ClaimResponse(BaseModel):
    job_id: str
    repo: str
    ref: str
    runtime: str
    command: List[str]
    env: Dict[str, str]
    timeout_seconds: int
    resource_limits: Dict[str, int]


class AppendLogRequest(BaseModel):
    worker_id: str
    lines: List[str]


class CompleteRequest(BaseModel):
    worker_id: str
    exit_code: int = 0
    success: bool = True
    message: Optional[str] = None
    result: Optional[Dict] = None


# -----------------------
# In-memory stores (prototype)
# -----------------------
# job_id -> job data
_JOBS: Dict[str, Dict] = {}
# a primitive lock to protect access in async environment
_JOBS_LOCK = asyncio.Lock()


# -----------------------
# Helper functions
# -----------------------
def _now() -> datetime.datetime:
    return datetime.datetime.utcnow().replace(tzinfo=datetime.timezone.utc)


async def _save_job(job_id: str, data: Dict) -> None:
    async with _JOBS_LOCK:
        _JOBS[job_id] = data


async def _get_job(job_id: str) -> Dict:
    async with _JOBS_LOCK:
        job = _JOBS.get(job_id)
        if job is None:
            raise KeyError(job_id)
        return job


async def _list_jobs() -> List[Dict]:
    async with _JOBS_LOCK:
        return list(_JOBS.values())


# -----------------------
# Internal utilities
# -----------------------
async def _atomically_claim_oldest(
    worker_id: str, runtime_pref: Optional[str]
) -> Optional[str]:
    """
    Find the oldest job in PENDING state (optionally matching runtime_pref),
    mark it CLAIMED and assign worker_id. Return job_id or None.
    """
    async with _JOBS_LOCK:
        # sort by creation time
        pending = [
            (jid, j) for jid, j in _JOBS.items() if j["state"] == JobState.PENDING
        ]
        if runtime_pref:
            pending = [
                (jid, j) for jid, j in pending if j.get("runtime") == runtime_pref
            ]
        if not pending:
            return None
        # find oldest by created_at
        pending.sort(key=lambda item: item[1]["created_at"])
        job_id, job = pending[0]
        job["state"] = JobState.CLAIMED
        job["worker_id"] = worker_id
        job["claimed_at"] = _now().isoformat()
        job["logs"].append(f"[{_now().isoformat()}] CLAIMED by worker {worker_id}")
        _JOBS[job_id] = job
        return job_id


# -----------------------
# Simulated runner (kept for convenience)
# -----------------------
async def _simulate_job_run(job_id: str) -> None:
    """
    Simulate running a job if no worker claims it.
    """
    try:
        job = await _get_job(job_id)
    except KeyError:
        logger.error("simulate: job %s not found", job_id)
        return

    # If job was canceled before run started, bail
    if job["state"] == JobState.CANCELED:
        logger.info("Job %s was canceled before run", job_id)
        return

    # Update state to RUNNING
    job["state"] = JobState.RUNNING
    job["started_at"] = _now().isoformat()
    job["logs"].append(f"[{_now().isoformat()}] state=RUNNING: starting simulated run")
    await _save_job(job_id, job)
    logger.info("Job %s running (simulated)", job_id)

    # Simulated steps
    steps = [
        "Preparing workspace",
        f"Fetching {job['repo']}@{job['ref']}",
        f"Using runtime {job['runtime']}",
        f"Executing: {' '.join(job['command'])}",
        "Collecting artifacts",
        "Finalizing",
    ]

    for step in steps:
        current_job = await _get_job(job_id)
        if current_job["state"] == JobState.CANCELED:
            current_job["logs"].append(
                f"[{_now().isoformat()}] state=CANCELED: run aborted"
            )
            await _save_job(job_id, current_job)
            logger.info("Job %s canceled during execution", job_id)
            return

        current_job["logs"].append(f"[{_now().isoformat()}] {step} ...")
        await _save_job(job_id, current_job)
        await asyncio.sleep(0.6)

    final_job = await _get_job(job_id)
    if "fail" in (final_job.get("ref") or "").lower():
        final_job["state"] = JobState.FAILED
        final_job["logs"].append(
            f"[{_now().isoformat()}] ERROR: simulated failure due to ref name"
        )
        final_job["finished_at"] = _now().isoformat()
        final_job["result"] = {"exit_code": 1, "message": "Simulated failure"}
    else:
        final_job["state"] = JobState.SUCCESS
        final_job["logs"].append(
            f"[{_now().isoformat()}] SUCCESS: simulated run complete"
        )
        final_job["finished_at"] = _now().isoformat()
        final_job["result"] = {"exit_code": 0, "message": "Simulated success"}

    await _save_job(job_id, final_job)
    logger.info("Job %s finished with state=%s", job_id, final_job["state"])


# -----------------------
# API endpoints (client)
# -----------------------
@app.get("/health", summary="Health check")
async def health():
    return {"status": "ok", "time": _now().isoformat()}


@app.post("/jobs", response_model=JobSummary, status_code=status.HTTP_201_CREATED)
async def enqueue_job(req: JobRequest, background_tasks: BackgroundTasks):
    """
    Enqueue a new job. Stores the job in the in-memory store.
    If no workers claim it, the internal simulated runner will execute it.
    """
    job_id = str(uuid.uuid4())
    now = _now().isoformat()
    job_data = {
        "job_id": job_id,
        "created_at": now,
        "state": JobState.PENDING,
        "repo": req.repo,
        "ref": req.ref,
        "runtime": req.runtime,
        "command": req.command,
        "env": req.env or {},
        "timeout_seconds": req.timeout_seconds or 900,
        "resource_limits": req.resource_limits or {"cpu": 1, "memory_mb": 1024},
        "logs": [],
        "result": None,
        "worker_id": None,
        "claimed_at": None,
        "started_at": None,
        "finished_at": None,
    }
    await _save_job(job_id, job_data)

    # schedule simulation as fallback (will run even if a worker claims later)
    # In production you'd use a real queue and worker; this is only a prototype.
    def _start_sim():
        asyncio.create_task(_simulate_job_run(job_id))

    background_tasks.add_task(_start_sim)

    logger.info("Enqueued job %s repo=%s ref=%s", job_id, req.repo, req.ref)
    return JobSummary(
        job_id=job_id,
        created_at=datetime.datetime.fromisoformat(now),
        state=JobState.PENDING,
        repo=req.repo,
        ref=req.ref,
        runtime=req.runtime,
    )


@app.get("/jobs", response_model=List[JobSummary])
async def list_jobs():
    items = await _list_jobs()
    summaries = []
    for j in items:
        summaries.append(
            JobSummary(
                job_id=j["job_id"],
                created_at=datetime.datetime.fromisoformat(j["created_at"]),
                state=j["state"],
                repo=j["repo"],
                ref=j["ref"],
                runtime=j["runtime"],
            )
        )
    summaries.sort(key=lambda s: s.created_at, reverse=True)
    return summaries


@app.get("/jobs/{job_id}", response_model=JobDetails)
async def get_job(job_id: str):
    try:
        j = await _get_job(job_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="job not found")
    return JobDetails(
        job_id=j["job_id"],
        created_at=datetime.datetime.fromisoformat(j["created_at"]),
        state=j["state"],
        repo=j["repo"],
        ref=j["ref"],
        runtime=j["runtime"],
        command=j["command"],
        env=j["env"],
        timeout_seconds=j["timeout_seconds"],
        resource_limits=j["resource_limits"],
        logs=j["logs"][-1000:],  # cap
        result=j.get("result"),
        worker_id=j.get("worker_id"),
        claimed_at=j.get("claimed_at"),
        started_at=j.get("started_at"),
        finished_at=j.get("finished_at"),
    )


@app.post("/jobs/{job_id}/cancel", status_code=204)
async def cancel_job(job_id: str):
    try:
        j = await _get_job(job_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="job not found")

    if j["state"] in (JobState.SUCCESS, JobState.FAILED, JobState.CANCELED):
        return

    j["state"] = JobState.CANCELED
    j["logs"].append(f"[{_now().isoformat()}] CANCELED by request")
    j["finished_at"] = _now().isoformat()
    await _save_job(job_id, j)
    logger.info("Job %s canceled", job_id)
    return


@app.get("/jobs/{job_id}/logs", response_model=List[str])
async def get_job_logs(job_id: str, tail: Optional[int] = 200):
    try:
        j = await _get_job(job_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="job not found")
    return j["logs"][-tail:]


# -----------------------
# Worker endpoints
# -----------------------
@app.post("/workers/claim", response_model=Optional[ClaimResponse])
async def worker_claim(
    req: ClaimRequest = Body(...), x_worker_secret: Optional[str] = Header(None)
):
    """
    Worker asks to claim the oldest pending job (optionally by runtime preference).
    Returns the claimed job details or 204/None if no job available.
    """
    # Validate worker secret (if configured)
    if not _validate_worker_secret(x_worker_secret):
        raise HTTPException(status_code=403, detail="invalid worker secret")

    worker_id = req.worker_id
    runtime_pref = req.runtime_pref
    logger.info("Worker %s requesting claim (pref=%s)", worker_id, runtime_pref)
    job_id = await _atomically_claim_oldest(
        worker_id=worker_id, runtime_pref=runtime_pref
    )
    if not job_id:
        # No job available
        return None

    job = await _get_job(job_id)
    # When a worker claims, set state to RUNNING and started_at
    job["state"] = JobState.RUNNING
    if not job.get("started_at"):
        job["started_at"] = _now().isoformat()
    job["logs"].append(
        f"[{_now().isoformat()}] state=RUNNING: worker {worker_id} started"
    )
    await _save_job(job_id, job)

    logger.info("Worker %s claimed job %s", worker_id, job_id)
    return ClaimResponse(
        job_id=job_id,
        repo=job["repo"],
        ref=job["ref"],
        runtime=job["runtime"],
        command=job["command"],
        env=job["env"],
        timeout_seconds=job["timeout_seconds"],
        resource_limits=job["resource_limits"],
    )


@app.post("/jobs/{job_id}/append", status_code=204)
async def append_job_logs(
    job_id: str,
    req: AppendLogRequest = Body(...),
    x_worker_secret: Optional[str] = Header(None),
):
    """
    Worker appends log lines for a job. The worker_id is recorded for validation.
    This endpoint is lightweight and intended for streaming partial output.
    """
    # Validate worker secret (if configured)
    if not _validate_worker_secret(x_worker_secret):
        raise HTTPException(status_code=403, detail="invalid worker secret")

    try:
        j = await _get_job(job_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="job not found")

    # Optional validation: ensure worker matches claimed worker
    if j.get("worker_id") and req.worker_id != j.get("worker_id"):
        # Allow append if job has no worker_id (fallback), otherwise reject
        raise HTTPException(status_code=403, detail="worker_id mismatch for job")

    # Append each line with timestamp
    ts = _now().isoformat()
    for line in req.lines:
        j["logs"].append(f"[{ts}] {req.worker_id}: {line}")
    await _save_job(job_id, j)
    return


@app.post("/jobs/{job_id}/complete", status_code=200)
async def complete_job(
    job_id: str,
    req: CompleteRequest = Body(...),
    x_worker_secret: Optional[str] = Header(None),
):
    """
    Worker reports completion of a job. Mark state SUCCESS/FAILED and store result.
    """
    # Validate worker secret (if configured)
    if not _validate_worker_secret(x_worker_secret):
        raise HTTPException(status_code=403, detail="invalid worker secret")

    try:
        j = await _get_job(job_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="job not found")

    # Validate worker identity if set
    if j.get("worker_id") and req.worker_id != j.get("worker_id"):
        raise HTTPException(status_code=403, detail="worker_id mismatch for job")

    # Set final state
    if req.success:
        j["state"] = JobState.SUCCESS
    else:
        j["state"] = JobState.FAILED

    j["finished_at"] = _now().isoformat()
    # Write result details
    j["result"] = {
        "exit_code": req.exit_code,
        "message": req.message or ("success" if req.success else "failed"),
    }
    if req.result:
        j["result"]["payload"] = req.result

    j["logs"].append(
        f"[{_now().isoformat()}] {req.worker_id}: COMPLETE success={req.success} exit_code={req.exit_code}"
    )
    await _save_job(job_id, j)
    logger.info("Job %s completed by %s state=%s", job_id, req.worker_id, j["state"])
    return {"job_id": job_id, "state": j["state"]}


# -----------------------
# Startup/shutdown
# -----------------------
@app.on_event("startup")
async def on_startup():
    logger.info("Orchestrator API starting up - worker-enabled prototype")


@app.on_event("shutdown")
async def on_shutdown():
    logger.info("Orchestrator API shutting down - clearing in-memory state")


# -----------------------
# CLI entrypoint for local dev
# -----------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "orchestrator.api.main:app", host="127.0.0.1", port=8001, log_level="info"
    )
