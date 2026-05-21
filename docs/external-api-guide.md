# Orchestration Center — External Integration Guide

## Overview

The Orchestration Center provides a public API (`/api/v1`) for external systems to
orchestrate and execute agent workflows. Three orchestration modes are supported:

| Mode | Endpoint | Input | Description |
|---|---|---|---|
| **SOP-based** | `POST /api/v1/orchestrate/sop` | SOP text or PDF | Fixed-step business process → PSOP |
| **Intent-based** | `POST /api/v1/orchestrate/intent` | Natural language intent | Open-ended task → PSOP |
| **Auto-execute** | `POST /api/v1/orchestrate/execute` | Task description | Search → orchestrate → execute (SSE) |

**Base URL**: `http://<host>:<port>` (default `http://127.0.0.1:60000`)

---

## Common Response Envelope

All non-streaming responses use:

```json
{
  "code": 200,
  "message": "success",
  "status": "success",
  "data": <payload>
}
```

HTTP status codes: `200` (OK), `201` (Created), `400` (Bad Request), `404` (Not Found), `413` (Payload Too Large), `429` (Too Many Requests), `503` (Server Busy), `500` (Server Error).

### Error Response Format

All error responses follow the same envelope:

```json
{
  "detail": "Human-readable error message"
}
```

| HTTP Status | Typical Cause |
|---|---|
| `400` | Invalid request parameters, missing required fields, invalid file format |
| `404` | PSOP workflow or execution record not found, no agents available |
| `413` | File too large (max 100 MB) |
| `429` | Rate limit exceeded |
| `503` | Server is busy (concurrency limit reached) |
| `500` | Internal server error, LLM generation failure, agent communication error |

---

## 1. SOP-Based Orchestration

Generates a PSOP workflow from a structured SOP (Standard Operating Procedure).
Accepts either JSON text or a PDF SolutionPackage file.
**When both JSON body and file are provided, the file takes precedence.**

```
POST /api/v1/orchestrate/sop
```

### Request (JSON body)

```json
{
  "sop_content": "## Step 1: Dispatch diagnosis to both city OMCs\n\n- Agent: Transport Workbench Agent\n- Skill: dispatch-diagnosis\n\n## Step 2: City 1 performs leased-line fault diagnosis\n\n- Agent: SPN Fault Handling Agent City1 OMC\n- Skill: leased-line-diagnosis\n\n## Step 3: City 2 performs leased-line fault diagnosis\n\n- Agent: SPN Fault Handling Agent City2 OMC\n- Skill: leased-line-diagnosis\n\n## Step 4: Aggregate and generate summary report\n\n- Agent: Transport Workbench Agent\n- Skill: aggregate-analysis",
  "name": "SPN-Leased-Line-Diagnosis"
}
```

### Request (File upload)

```
Content-Type: multipart/form-data
file: <SolutionPackage.pdf>
name: <Optional workflow name>
```

The PDF must contain chapter "5. Interaction Flow" with SOP steps.
The `name` field is optional; if omitted, the PDF filename is used.

### Response (201 Created)

```json
{
  "code": 201,
  "message": "PSOP generated and saved",
  "status": "success",
  "data": {
    "id": "uuid",
    "name": "SPN-Leased-Line-Diagnosis",
    "steps": [ /* Array<Step> */ ],
    "created_at": "2026-05-20T21:00:00",
    "tags": []
  }
}
```

### curl Example

```bash
# Text SOP
curl -X POST http://127.0.0.1:60000/api/v1/orchestrate/sop \
  -H "Content-Type: application/json" \
  -d '{"sop_content": "## Step 1: Dispatch diagnosis\n- Agent: Transport Workbench Agent\n- Skill: dispatch-diagnosis\n\n## Step 2: City OMC diagnosis\n- Agent: SPN Fault Handling Agent City1 OMC\n- Skill: spn-diagnosis", "name": "test"}'

# PDF upload with optional name
curl -X POST http://127.0.0.1:60000/api/v1/orchestrate/sop \
  -F "file=@SolutionPackage.pdf" \
  -F "name=SPN-Leased-Line-Diagnosis"
```

---

## 2. Intent-Based Orchestration

Generates a PSOP workflow from a free-form natural language description.
No SOP steps required — the LLM plans the workflow autonomously.

```
POST /api/v1/orchestrate/intent
```

### Request

```json
{
  "intent": "Perform energy optimization across all base stations. First evaluate current energy consumption, then generate optimization strategies and deploy them.",
  "name": "Network-Wide-Energy-Optimization"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `intent` | string | Yes | Natural language task description |
| `name` | string | No | Workflow name (auto-generated if omitted) |

### Response (201 Created)

Same PSOP structure as SOP endpoint. The `user_intent` field records the original intent.

### curl Example

```bash
curl -X POST http://127.0.0.1:60000/api/v1/orchestrate/intent \
  -H "Content-Type: application/json" \
  -d '{"intent": "Optimize energy consumption across all base stations", "name": "Energy Optimization"}'
```

---

## 3. Auto-Orchestrate + Execute (SSE)

The primary external execution endpoint. Given a task description:
1. Searches existing PSOPs by semantic match
2. If found, executes the best match
3. If not found, auto-generates a new PSOP via intent orchestration, then executes

Returns a **Server-Sent Events (SSE)** stream with real-time execution progress.

```
POST /api/v1/orchestrate/execute
```

### Request

```json
{
  "task": "Diagnose leased-line faults in both city SPN networks and generate a summary report",
  "name": "SPN-Diagnosis"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `task` | string | Yes | Task description for search/orchestration |
| `name` | string | No | Workflow name for auto-generation |

### SSE Event Types

| Event | Direction | Description |
|---|---|---|
| `init` | → | Execution engine initialized |
| `start` | → | Workflow execution started |
| `agent_request` | → | Message sent to an agent |
| `agent_response` | ← | Agent's response received |
| `psop_update` | → | PSOP state updated (task status changes) |
| `complete` | → | Workflow execution completed successfully |
| `error` | → | Workflow execution failed |
| `close` | → | SSE connection closed |

### SSE Event Format

```
data: {"type":"agent_request","data":{"agent":"Transport Workbench Agent","request":"..."},"timestamp":1716230401.0}

data: {"type":"agent_response","data":{"agent":"Transport Workbench Agent","response":"..."},"timestamp":1716230403.0}

data: {"type":"complete","data":{"psop_id":"uuid","execution_history":[...]}}

event: close
data: {}
```

### Agent Request Event

```json
{
  "type": "agent_request",
  "data": {
    "agent": "Transport Workbench Agent",
    "request": "message_id: \"xxx\"\nrole: ROLE_AGENT\nparts {\n  text: \"task content\"\n}\n"
  },
  "timestamp": 1716230401.0
}
```

### Agent Response Event

```json
{
  "type": "agent_response",
  "data": {
    "agent": "Transport Workbench Agent",
    "response": "{\"id\":\"...\",\"status\":{\"state\":\"TASK_STATE_COMPLETED\"},\"artifacts\":[{\"parts\":[{\"text\":\"response content\"}]}]}"
  },
  "timestamp": 1716230403.0
}
```

### Complete Event

```json
{
  "type": "complete",
  "data": {
    "psop_id": "uuid",
    "execution_history": [
      {"step": "step1", "task": "task description", "status": "SUCCESS", "output": "..."},
      {"step": "step2", "task": "task description", "status": "SUCCESS", "output": "..."}
    ]
  }
}
```

### PSOP Update Event

Emitted when task status changes during execution (e.g., from `PENDING` to `RUNNING` or `COMPLETED`).

```json
{
  "type": "psop_update",
  "data": {
    "psop_id": "uuid",
    "step": "step1",
    "task_status": "RUNNING",
    "message": "Step step1 execution started"
  },
  "timestamp": 1716230402.0
}
```

### curl Example (SSE)

```bash
curl -N -X POST http://127.0.0.1:60000/api/v1/orchestrate/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "Diagnose leased-line faults in both city OMCs and generate a summary report"}'
```

### Client Integration Pattern (JavaScript)

```javascript
async function executeWorkflow(task) {
  const response = await fetch('http://127.0.0.1:60000/api/v1/orchestrate/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const event = JSON.parse(line.slice(6));
        console.log(event.type, event.data);
      }
    }
  }
}
```

### Client Integration Pattern (Python)

```python
import requests
import json

def execute_workflow(task: str, base_url: str = "http://127.0.0.1:60000"):
    response = requests.post(
        f"{base_url}/api/v1/orchestrate/execute",
        json={"task": task},
        stream=True,
        headers={"Accept": "text/event-stream"}
    )

    for line in response.iter_lines(decode_unicode=True):
        if line and line.startswith("data: "):
            event = json.loads(line[6:])
            event_type = event.get("type")
            if event_type == "agent_response":
                print(f"[{event['data']['agent']}] {event['data']['response'][:100]}")
            elif event_type == "complete":
                print(f"Execution complete: {event['data']['psop_id']}")
                return event['data']
            elif event_type == "error":
                raise RuntimeError(event['data']['error'])
```

---

## 4. Execute Known PSOP

Execute a previously generated PSOP workflow by its ID. Returns an SSE stream.

```
GET /api/v1/orchestrate/execute/{psop_id}
```

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `psop_id` | string | The PSOP workflow ID (returned by SOP or intent orchestration) |

### curl Example

```bash
curl -N http://127.0.0.1:60000/api/v1/orchestrate/execute/6a204d60-f2ff-471b-9892-c5beae1c3a5c
```

---

## 5. List Available Agents

Returns the complete agent inventory from the registry.

```
GET /api/v1/agents
```

### Response

```json
{
  "code": 200,
  "status": "success",
  "data": [
    {
      "name": "Transport Workbench Agent",
      "description": "Responsible for dispatching...",
      "skills": [
        {"id": "dispatch-diagnosis", "name": "Dispatch Diagnosis", "description": "..."},
        {"id": "aggregate-analysis", "name": "Aggregate Analysis", "description": "..."}
      ],
      "supportedInterfaces": [{"url": "http://127.0.0.1:8904", "protocolBinding": "HTTP+JSON"}]
    }
  ]
}
```

---

## 6. Get Execution Result

Retrieve the full execution record (all agent interactions, final PSOP state, execution history).

```
GET /api/v1/executions/{execution_id}
```

The `execution_id` is available in the `complete` SSE event or can be obtained from the execution records list.

### Response

```json
{
  "code": 200,
  "status": "success",
  "data": {
    "execution_id": "uuid",
    "psop_id": "uuid",
    "psop_name": "SPN-Leased-Line-Diagnosis",
    "started_at": "2026-05-20T21:00:00",
    "completed_at": "2026-05-20T21:00:45",
    "status": "success",
    "execution_history": [
      {"step": "step1", "task": "...", "status": "SUCCESS", "output": "..."}
    ],
    "final_psop": { /* full PSOP with updated task statuses */ },
    "events": [ /* all agent_request/response events */ ],
    "error": null
  }
}
```

---

## Integration Flow Summary

```
┌──────────────────┐
│ External System  │
└────────┬─────────┘
         │
         │  POST /api/v1/orchestrate/sop     ──→ PSOP (from SOP text/PDF)
         │  POST /api/v1/orchestrate/intent  ──→ PSOP (from intent)
         │
         │  POST /api/v1/orchestrate/execute ──→ SSE stream (search + orchestrate + execute)
         │  GET  /api/v1/orchestrate/execute/{id} ──→ SSE stream (execute known PSOP)
         │
         │  GET /api/v1/agents              ──→ Agent inventory
         │  GET /api/v1/executions/{id}     ──→ Execution result
         │
         ▼
┌──────────────────┐
│ Orchestration    │
│ Center           │
│  ┌─────────────┐ │
│  │ PSOP Engine │ │────→ Agent 1 (port 8899)
│  │             │ │────→ Agent 2 (port 8900)
│  │             │ │────→ ...
│  └─────────────┘ │
└──────────────────┘
```

## Typical Integration Pattern

```
1. GET /api/v1/agents                    → Discover available agents & skills
2. POST /api/v1/orchestrate/sop          → Create PSOP from SOP (or skip to step 3)
   or
   POST /api/v1/orchestrate/intent       → Create PSOP from intent
3. POST /api/v1/orchestrate/execute      → Execute (auto-search + auto-orchestrate + SSE stream)
4. GET /api/v1/executions/{execution_id} → Retrieve detailed execution result
```

## Notes

- The external API prefix is `/api/v1`. Internal UI endpoints use `/rest/v1/orchestrate`.
- All orchestration endpoints auto-save the generated PSOP.
- The `/orchestrate/execute` endpoint persists an `ExecutionRecord` on completion for later retrieval.
- SSE connections use `text/event-stream` with keep-alive. Clients should handle reconnection.
- Rate limiting applies to all endpoints (default 50 req/s per endpoint, configurable in `etc/conf/server.conf`).
- Agent availability depends on the agent registry service. The orchestration center queries it on each request.
- No authentication is required in the open-source release. Authentication can be added via middleware for production deployments.
