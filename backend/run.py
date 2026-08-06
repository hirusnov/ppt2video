"""
Local development runner for Windows.
Sets ProactorEventLoop before uvicorn starts to enable subprocess support.
Loads .env file automatically before starting the server.
Usage: python run.py
"""
import sys
import asyncio
from pathlib import Path

# Load .env before anything else so env vars are available at import time
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        loop="asyncio",
    )
