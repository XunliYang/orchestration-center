# Copyright (c) 2026 Huawei Technologies Co., Ltd.
# All Rights Reserved.
#
#    Licensed under the Apache License, Version 2.0 (the "License"); you may
#    not use this file except in compliance with the License. You may obtain
#    a copy of the License at
#
#         http://www.apache.org/licenses/LICENSE-2.0
#
#    Unless required by applicable law or agreed to in writing, software
#    distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
#    WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
#    License for the specific language governing permissions and limitations
#    under the License.

"""
Shared SSE execution engine.

Used by both the internal API (frontend_support_server.py) and the
external API (external_api.py) to avoid code duplication.
"""

import asyncio
import json
import queue
import threading
from datetime import datetime
from typing import List

from a2a.types import AgentCard
from fastapi.responses import StreamingResponse
from loguru import logger

from common.custom.default_handle import HandlerRegistry
from common.custom.interface_type import InterfaceType
from orchestrate.core.model.execution_record import ExecutionRecord
from orchestrate.core.model.psop import PSOP
from orchestrate.runtime.exec_engine import DynamicWorkflowEngine
from samples.a2at_config import get_a2at_env_path


async def run_psop_sse(psop: PSOP, agent_cards: List[AgentCard]) -> StreamingResponse:
    """
    Execute a PSOP workflow and return an SSE stream.

    Args:
        psop: The PSOP workflow to execute.
        agent_cards: List of available agent cards for routing tasks.

    Returns:
        StreamingResponse with SSE event stream containing agent_request,
        agent_response, psop_update, complete/error, and close events.
        Persists an ExecutionRecord on completion.
    """
    async def event_generator():
        event_queue = queue.Queue()
        collected_events = []
        started_at = datetime.now()

        def push_callback(event_type: str, data: dict):
            try:
                serializable_data = {}
                for key, value in data.items():
                    if hasattr(value, 'model_dump'):
                        serializable_data[key] = value.model_dump()
                    elif hasattr(value, '__dict__'):
                        try:
                            serializable_data[key] = value.__dict__
                        except Exception:
                            serializable_data[key] = str(value)
                    elif isinstance(value, (tuple, list)):
                        serializable_data[key] = []
                        for item in value:
                            if hasattr(item, 'model_dump'):
                                serializable_data[key].append(item.model_dump())
                            elif hasattr(item, '__dict__'):
                                try:
                                    serializable_data[key].append(item.__dict__)
                                except Exception:
                                    serializable_data[key].append(str(item))
                            else:
                                serializable_data[key].append(item)
                    else:
                        serializable_data[key] = value

                event_data = {
                    "type": event_type,
                    "data": serializable_data,
                    "timestamp": asyncio.get_event_loop().time() if asyncio.get_event_loop().is_running() else 0
                }
                event_queue.put(event_data)
                if event_type in ("agent_request", "agent_response"):
                    collected_events.append(event_data)
            except Exception as e:
                logger.error(f"Failed to push event: {e}")

        async def run_workflow_async():
            record_status = "success"
            record_error = None
            execution_history = []
            try:
                a2at_env_path = get_a2at_env_path()
                engine = DynamicWorkflowEngine(psop, agent_cards, a2at_env_path=a2at_env_path)
                engine.set_push_callback(push_callback)
                event_queue.put({
                    "type": "start",
                    "data": {"psop_id": psop.id, "message": "Execution started"}
                })
                execution_history = await engine.run()
                event_queue.put({
                    "type": "complete",
                    "data": {"psop_id": psop.id, "execution_history": execution_history}
                })
            except Exception as e:
                logger.error(f"Execution failed: {e}")
                record_status = "failed"
                record_error = str(e)
                event_queue.put({
                    "type": "error",
                    "data": {"psop_id": psop.id, "error": str(e)}
                })
            finally:
                try:
                    final_psop = None
                    try:
                        final_psop = psop.model_dump() if hasattr(psop, 'model_dump') else str(psop)
                    except Exception:
                        pass
                    record = ExecutionRecord(
                        psop_id=psop.id,
                        psop_name=getattr(psop, 'name', ''),
                        started_at=started_at,
                        completed_at=datetime.now(),
                        status=record_status,
                        execution_history=execution_history,
                        final_psop=final_psop,
                        events=collected_events,
                        error=record_error,
                    )
                    handler = HandlerRegistry.get_handler(InterfaceType.SAVE_EXECUTION_RECORD)
                    handler.handle(record)
                    logger.info(f"Execution record saved: {record.execution_id}")
                except Exception as e:
                    logger.error(f"Failed to save execution record: {e}")

        def run_workflow():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(run_workflow_async())
            finally:
                loop.close()

        workflow_thread = threading.Thread(target=run_workflow)
        workflow_thread.daemon = True
        workflow_thread.start()

        init_event = {'type': 'init', 'data': {'psop_id': psop.id, 'message': 'Initializing execution engine'}}
        yield f"data: {json.dumps(init_event)}\n\n"

        while workflow_thread.is_alive() or not event_queue.empty():
            try:
                event = event_queue.get(timeout=1)
                yield f"data: {json.dumps(event)}\n\n"
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Failed to process event: {e}")

        yield "event: close\ndata: {}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        }
    )
