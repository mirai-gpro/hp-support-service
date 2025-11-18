# CLAUDE.md - HP Support Service

> **AI Assistant Guide**: This document provides comprehensive context about the HP Support Service codebase to help AI assistants understand the architecture, make informed decisions, and maintain code quality.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Codebase Structure](#codebase-structure)
4. [Key Components](#key-components)
5. [Development Workflows](#development-workflows)
6. [API Reference](#api-reference)
7. [Coding Conventions](#coding-conventions)
8. [Common Tasks](#common-tasks)
9. [Important Considerations](#important-considerations)
10. [Testing & Deployment](#testing--deployment)

---

## Project Overview

**HP Support Service** is an AI-powered website editing assistant that enables real-time HTML modification through natural language instructions. It provides an interactive interface for:

- **Real-time preview** of websites in an isolated iframe
- **Natural language chat** for modification instructions (powered by Google Gemini)
- **Immediate modifications** (font size, colors, text, deletion)
- **Batch modifications** via AI-generated JSON instructions
- **Voice interaction** with speech recognition and text-to-speech
- **Session management** for tracking conversation and modification history

**Tech Stack**:
- Backend: Python 3.11 + Flask
- Frontend: Vanilla JavaScript + HTML/CSS
- AI: Google Gemini 2.0 Flash
- Cloud: Google Cloud Storage, Text-to-Speech API
- Deployment: Docker + Gunicorn (Cloud Run compatible)

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Browser                        │
│  ┌──────────────┐                    ┌──────────────────┐  │
│  │  index.html  │◄───────────────────┤ modification.js  │  │
│  │  (UI Layer)  │    DOM Updates     │ (Logic Layer)    │  │
│  └──────┬───────┘                    └────────┬─────────┘  │
│         │                                      │             │
│         │ PostMessage                          │ Fetch API  │
│         │                                      │             │
│  ┌──────▼────────────────────────────────────▼─────────┐  │
│  │       iFrame Preview (Sandboxed Website)           │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ HTTP/JSON
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Flask Backend (app_hp_support.py)          │
│  ┌──────────────┐  ┌────────────────┐  ┌──────────────┐   │
│  │   Session    │  │ Prompt Manager │  │  TTS Client  │   │
│  │  Management  │  │  (GCS Cached)  │  │ (Lazy Init)  │   │
│  └──────────────┘  └────────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ API Calls
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              External Services (Google Cloud)                │
│  ┌──────────────┐  ┌────────────────┐  ┌──────────────┐   │
│  │ Gemini API   │  │   Cloud GCS    │  │  Cloud TTS   │   │
│  │ (AI Chat)    │  │ (File Storage) │  │ (Voice)      │   │
│  └──────────────┘  └────────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Key Architectural Patterns

1. **Session State Pattern**: In-memory session storage with conversation logs
2. **Lazy Initialization**: Services (TTS, Gemini) initialized on first request
3. **Fallback Strategy**: GCS → Default Preview URL fallback chain
4. **Prompt Caching**: 60-minute TTL for GCS-backed prompts
5. **Event-Driven Frontend**: PostMessage for cross-frame communication
6. **Undo Stack**: History tracking for DOM modifications

---

## Codebase Structure

```
hp-support-service/
├── app_hp_support.py          # Flask backend (1053 lines)
│   ├── API endpoints (18 routes)
│   ├── Session management
│   ├── GCS integration
│   └── Gemini/TTS client initialization
│
├── prompt_manager.py          # Prompt management (150 lines)
│   ├── GCS prompt loading with caching
│   ├── Template variable substitution
│   └── Fallback to default prompts
│
├── index.html                 # Main UI (1037 lines)
│   ├── Chat interface
│   ├── Preview pane with iframe
│   ├── Voice control UI
│   └── Action buttons
│
├── static/
│   └── modification.js        # Frontend logic (557 lines)
│       ├── ModificationManager class
│       ├── DOM manipulation
│       ├── Undo/redo functionality
│       └── API client code
│
├── Dockerfile                 # Container definition
├── .gitignore                 # Git exclusions
└── README.md                  # Basic documentation
```

**Total LOC**: ~3,000 lines
**Primary Files**: 4 (app, prompt_manager, index, modification.js)

---

## Key Components

### 1. Flask Backend (`app_hp_support.py`)

**Core Classes**:
- `AppState`: Singleton for session storage and service clients
- Global variables: `state`, `prompt_manager`, `tts_client`

**Service Initialization** (`app_hp_support.py:62-70`):
```python
@app.before_request
def initialize_services():
    """Initialize prompts and TTS client once on first request"""
```

**Important Endpoints**:
- `/api/chat` (line 634): Main chat endpoint with immediate/batch classification
- `/api/save-html` (line 838): Save modified HTML to GCS
- `/preview/<filename>` (line 90): Asset serving with fallback
- `/api/tts/synthesize` (line 535): Text-to-speech conversion

**Session Structure**:
```python
{
    "id": "uuid",
    "created_at": "ISO-8601",
    "case_type": "new",
    "client_info": {},
    "conversation_log": [],  # Chat history
    "build_jobs": [],        # Astro build references
    "fix_instructions": []   # Generated documents
}
```

### 2. Prompt Manager (`prompt_manager.py`)

**Purpose**: Manage AI prompts with GCS caching

**Key Methods**:
- `get(name, **variables)`: Retrieve and template-substitute prompts
- `reload()`: Force reload from GCS (admin API)
- `_load_from_gcs()`: Load from `prompts/*.txt` in GCS bucket

**Prompt Files Expected in GCS**:
- `prompts/fix_instructions.txt`
- `prompts/chat_system.txt`
- `prompts/selection_analysis.txt`

**Cache Behavior**:
- TTL: 60 minutes
- Fallback: Hardcoded defaults in `_load_defaults()`

### 3. Frontend Logic (`static/modification.js`)

**ModificationManager Class**:
```javascript
class ModificationManager {
    modifications: []         // History of changes
    selectedElement: Element  // Currently selected DOM element
    selectedText: string      // Selected text content
    sessionId: string         // Active session ID
    iframeElement: HTMLIFrameElement
}
```

**Key Methods**:
- `applyModificationFromJSON(obj)`: Apply modification from AI response
- `classifyModification(input)`: Detect immediate vs batch type
- `undo()`: Revert last modification

**Modification Types Supported**:
- `text`: Change text content
- `color`: Change text color
- `background`: Change background color
- `fontSize`: Resize text
- `style`: Arbitrary CSS changes
- `attribute`: Change HTML attributes
- `delete`: Remove text or element
- `undo`: Revert previous change

**Critical Pattern** (`modification.js:44-70`):
```javascript
// Always save originalHtml before modification
const originalHtml = element.outerHTML;
// Apply change
element.style.property = value;
// Track in history
this.modifications.push({...});
```

### 4. UI Interface (`index.html`)

**Layout**:
- Left pane: Preview iframe (flex: 2)
- Right sidebar: Chat + actions (flex: 1)

**Key UI Components**:
- Chat area with message history
- Voice control buttons (start/stop recognition, TTS playback)
- Action buttons (build, save, import site, undo)
- Selection display panel

**Message Flow**:
1. User types/speaks message
2. `sendMessage()` → POST `/api/chat`
3. AI response displayed + modification applied
4. History updated in chat area

---

## Development Workflows

### Branch Strategy

**Current Branch**: `claude/claude-md-mi48kiocy01s53ep-01GdEDgBfRWYcQopPCjDed2q`

**Branch Naming Convention**:
- Format: `claude/<task-description>-<session-id>`
- Always develop on Claude-prefixed branches
- Push with `-u origin <branch-name>`

**Git Workflow**:
1. Develop on feature branch
2. Commit with descriptive messages
3. Push to origin
4. Create PR (via external system, not `gh`)

### Commit Message Style

Based on recent history:
- "Implement [feature] for [component]"
- "Add [functionality] to [file]"
- "Fix [issue] in [component]"
- Use present tense, imperative mood

**Examples**:
- ✅ "Implement undo functionality for modifications"
- ✅ "Add partial text deletion support"
- ✅ "Fix block deletion issue"
- ❌ "Updated code"
- ❌ "Changes"

### Adding New Features

**Standard Process**:

1. **Understand the requirement**
   - Identify if it's frontend, backend, or full-stack
   - Check for existing similar patterns

2. **Locate relevant files**
   - Backend API: `app_hp_support.py`
   - Frontend logic: `static/modification.js`
   - UI: `index.html`

3. **Implement with logging**
   ```python
   logger.info(f"[Feature] Step description: {data}")
   ```

4. **Test manually**
   - Use `/health` endpoint to verify service status
   - Test in browser UI
   - Check browser console for JS errors

5. **Update CLAUDE.md** if architectural changes made

### Debugging Guidelines

**Backend Debugging**:
```python
# Always use logger, not print()
logger.info(f"[Component] Info: {value}")
logger.warning(f"[Component] Warning: {issue}")
logger.error(f"[Component] Error: {error}")
traceback.print_exc()  # For exceptions
```

**Frontend Debugging**:
```javascript
// Use consistent prefixes
console.log('[ModificationManager] Action:', data);
console.error('[ModificationManager] ❌ Error:', error);
console.info('[ModificationManager] ✅ Success:', result);
```

**Debug Flags**:
- Check `logger.info` lines in `app_hp_support.py` for trace flow
- Look for "========== " separators in JS for important sections

---

## API Reference

### Session Management

#### `POST /api/sessions`
Create new session
```json
Request: {"caseType": "new", "clientInfo": {}}
Response: {"success": true, "sessionId": "uuid"}
```

#### `GET /api/sessions/<session_id>`
Retrieve session details
```json
Response: {"success": true, "session": {...}}
```

### Chat & Modifications

#### `POST /api/chat`
Send message and get modification instructions (line 634)
```json
Request: {
  "message": "文字を20%小さくして",
  "selection": {
    "selector": "h1.title",
    "selectedText": "タイトル",
    "tagName": "H1"
  },
  "history": [],
  "session_id": "uuid"
}

Response: {
  "success": true,
  "action": "immediate",
  "response": "文字サイズを20%小さくしました",
  "modification": {
    "selector": "h1.title",
    "type": "fontSize",
    "newValue": "12.8px",
    "description": "フォントサイズを16pxから12.8pxに縮小"
  }
}
```

**Key Logic** (line 659-780):
- Gemini receives structured prompt with examples
- Returns JSON with `action`, `response`, `modification`
- Frontend applies modification to iframe DOM

#### `POST /api/add-selection`
Record user text selection
```json
Request: {
  "session_id": "uuid",
  "selection": {
    "text": "選択されたテキスト",
    "selector": "p.intro",
    "tagName": "P"
  }
}
Response: {
  "success": true,
  "selection_id": 0,
  "auto_question": "この部分をどのように修正しますか？"
}
```

### Content Generation

#### `POST /api/generate-fix-instructions`
Generate modification document from conversation (line 417)
```json
Request: {"session_id": "uuid"}
Response: {
  "success": true,
  "fix_instructions": "<html>修正指示書...</html>"
}
```

Uses prompt: `fix_instructions` with variables:
- `timestamp`: Current time
- `session_id`: Session ID
- `conversation_text`: Formatted chat history

#### `POST /api/download-word`
Export fix instructions as .docx (line 464)
```json
Request: {"session_id": "uuid"}
Response: Binary file stream (application/vnd.openxmlformats...)
```

### Text-to-Speech

#### `POST /api/tts/synthesize`
Convert text to speech (line 535)
```json
Request: {
  "text": "合成するテキスト",
  "language_code": "ja-JP",
  "voice_name": "ja-JP-Neural2-B",
  "speaking_rate": 1.0,
  "pitch": 0.0,
  "volume_gain_db": 0.0
}
Response: {
  "success": true,
  "audio": "base64-encoded-mp3-data",
  "format": "mp3",
  "text_length": 123
}
```

**Limits**: Max 5000 characters (enforced at line 548)

#### `GET /api/tts/voices?language_code=ja-JP`
List available voices
```json
Response: {
  "success": true,
  "voices": [
    {
      "name": "ja-JP-Neural2-B",
      "language_codes": ["ja-JP"],
      "ssml_gender": "FEMALE",
      "natural_sample_rate_hertz": 24000
    }
  ],
  "count": 1
}
```

### Build Integration

#### `POST /api/trigger-build`
Trigger Astro build service (line 321)
```json
Request: {
  "session_id": "uuid",
  "diffData": {...}
}
Response: {
  "success": true,
  "jobId": "build-uuid",
  "status": "pending"
}
```

Calls external service: `$ASTRO_BUILD_SERVICE_URL/build`

#### `GET /api/build-status/<job_id>`
Poll build status
```json
Response: {
  "success": true,
  "status": "completed",
  "result": {...}
}
```

### File Operations

#### `POST /api/upload-file`
Upload file to GCS (line 392)
```
Content-Type: multipart/form-data
Fields: file, session_id, purpose
Response: {"success": true, "file_url": "https://..."}
```

#### `POST /api/save-html`
Save modified HTML to GCS (line 838)
```json
Request: {
  "html": "<html>...</html>",
  "modifications": [...]
}
Response: {
  "success": true,
  "saved_path": "modified_html/index_20231118_123456.html",
  "log_path": "modification_logs/log_20231118_123456.json"
}
```

#### `POST /api/import-site`
Import external website HTML (line 889)
```json
Request: {"url": "https://example.com"}
Response: {
  "success": true,
  "preview_url": "https://storage.googleapis.com/.../site_timestamp.html",
  "original_url": "https://example.com",
  "saved_path": "imported_sites/site_timestamp.html"
}
```

**Process**:
1. Fetch URL with User-Agent header
2. Inject selection detection script
3. Upload to GCS with public access
4. Return public URL

### Preview System

#### `GET /preview/<filename>`
Serve preview files with fallback (line 90)

**Fallback Chain**:
1. Try GCS: `gs://$GCS_OUTPUT_BUCKET/$GCS_OUTPUT_PATH/<filename>`
2. If not found: Fetch from `$DEFAULT_PREVIEW_URL/<filename>`
3. Cache successful fetch to GCS

**Special Handling for `index.html`**:
- Inject `<base href="/preview/">` tag
- Inject selection detection script

**Content-Type Detection** (line 96-119):
- `.css` → `text/css`
- `.js` → `application/javascript`
- `.json` → `application/json`
- Images: `.png`, `.jpg`, `.svg`, `.webp`, `.gif`
- Fonts: `.woff`, `.woff2`, `.ttf`

### Admin Endpoints

#### `POST /api/admin/reload-prompts`
Force reload prompts from GCS (line 497)
```json
Response: {
  "success": true,
  "message": "プロンプトを再読み込みしました",
  "loaded": ["fix_instructions", "chat_system"],
  "time": "2023-11-18T12:34:56",
  "source": "gcs"
}
```

#### `GET /api/admin/prompts`
List loaded prompts (line 513)
```json
Response: {
  "success": true,
  "prompts": {
    "fix_instructions": {
      "length": 500,
      "preview": "以下の会話から修正指示書を作成..."
    }
  },
  "last_loaded": "2023-11-18T12:00:00",
  "cache_minutes": 60
}
```

### Health Check

#### `GET /health`
Service health status (line 77)
```json
Response: {
  "status": "healthy",
  "service": "hp-support",
  "gemini_configured": true,
  "tts_configured": true,
  "prompts_bucket": true,
  "preview_bucket": "gen-lang-client-0691275473-preview/current",
  "default_preview_url": "https://gen-lang-client-0691275473.web.app"
}
```

---

## Coding Conventions

### Python Style

**Imports**:
```python
# Standard library
import os
import json
from datetime import datetime

# Third-party
from flask import Flask, request, jsonify
import google.generativeai as genai

# Local
from prompt_manager import PromptManager
```

**Function Documentation**:
```python
def function_name(param):
    """Brief description

    Args:
        param: Description

    Returns:
        Description
    """
```

**Error Handling Pattern**:
```python
try:
    # Operation
    result = operation()
    logger.info(f"Success: {result}")
    return jsonify({"success": True, "data": result})
except Exception as e:
    logger.error(f"Error: {e}")
    traceback.print_exc()
    return jsonify({"success": False, "error": str(e)}), 500
```

**Route Pattern**:
```python
@app.route("/api/endpoint", methods=["POST"])
def endpoint_name():
    data = request.json
    session_id = data.get("session_id")

    # Validation
    if not session_id:
        return jsonify({"success": False, "error": "..."}), 400

    # Logic
    try:
        result = process(data)
        return jsonify({"success": True, "result": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
```

### JavaScript Style

**Class Structure**:
```javascript
class ClassName {
    constructor() {
        this.property = value;
        console.log('[ClassName] 初期化完了');
    }

    methodName(param) {
        console.log('[ClassName] Method:', param);
        // Logic
        return result;
    }
}
```

**Error Handling**:
```javascript
try {
    const result = await fetch('/api/endpoint', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    const json = await result.json();
    console.log('[Component] ✅ Success:', json);
} catch (error) {
    console.error('[Component] ❌ Error:', error);
    alert('エラーが発生しました: ' + error.message);
}
```

**DOM Manipulation Safety**:
```javascript
// Always work within iframe context
const iframe = document.getElementById('hp-preview');
const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

// Save state before modification
const originalHtml = element.outerHTML;

// Apply change
element.style.property = value;

// Track change
this.modifications.push({
    element: element,
    originalHtml: originalHtml,
    modifiedHtml: element.outerHTML
});
```

### HTML/CSS Style

**Inline Styles**: Used in `index.html` (no separate CSS file)

**Naming Conventions**:
- Classes: `.kebab-case` (e.g., `.chat-area`, `.preview-pane`)
- IDs: `camelCase` (e.g., `#chatArea`, `#hpPreview`)

**Responsive Design**:
- Flexbox layout
- Two-pane interface (preview + sidebar)
- Action buttons with hover states

---

## Common Tasks

### Task 1: Add a New API Endpoint

**Steps**:

1. **Add route in `app_hp_support.py`**:
```python
@app.route("/api/new-endpoint", methods=["POST"])
def new_endpoint():
    """Brief description"""
    try:
        data = request.json
        session_id = data.get("session_id")

        # Validation
        if not session_id or session_id not in state.sessions:
            return jsonify({"success": False, "error": "Invalid session"}), 400

        # Logic here
        result = process_data(data)

        # Update session if needed
        state.sessions[session_id]["key"] = result

        return jsonify({"success": True, "result": result})
    except Exception as e:
        logger.error(f"New endpoint error: {e}")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
```

2. **Add frontend call in `index.html` or `modification.js`**:
```javascript
async function callNewEndpoint(data) {
    try {
        const response = await fetch('/api/new-endpoint', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                session_id: sessionId,
                ...data
            })
        });
        const result = await response.json();
        if (result.success) {
            console.log('[NewFeature] ✅ Success:', result);
            return result;
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('[NewFeature] ❌ Error:', error);
        throw error;
    }
}
```

3. **Update this CLAUDE.md** with API documentation

### Task 2: Add a New Modification Type

**Steps**:

1. **Update Gemini prompt in `/api/chat` endpoint** (line 752):
```python
# Add to modification types list
"""
修正タイプ一覧:
- newType: Description (newValue例: "example")
"""
```

2. **Add concrete example**:
```python
**具体例X: New Type**
入力: 「User instruction」
選択: selector="element"
出力:
{{
  "action": "immediate",
  "response": "Response message",
  "modification": {{
    "selector": "element",
    "type": "newType",
    "newValue": "value",
    "description": "Description"
  }}
}}
```

3. **Implement in `static/modification.js`** (line 73+):
```javascript
switch(modificationObj.type) {
    // ... existing cases ...

    case 'newType':
        console.log('[ModificationManager] New type:', modificationObj.newValue);
        element.property = modificationObj.newValue;
        console.log('[ModificationManager] ✅ New type applied');
        break;
```

4. **Test with user message** matching the pattern

### Task 3: Add a New Prompt Template

**Steps**:

1. **Create prompt file in GCS**:
   - Bucket: `$PROMPTS_BUCKET_NAME`
   - Path: `prompts/new_prompt.txt`
   - Content: Template with `{variable}` placeholders

2. **Use in code**:
```python
prompt = prompt_manager.get(
    "new_prompt",
    variable1=value1,
    variable2=value2
)
```

3. **Add fallback in `prompt_manager.py`** (line 144):
```python
def _get_default(self, name):
    defaults = {
        # ... existing ...
        "new_prompt": "Default template with {variable1}"
    }
```

4. **Test**: Call `/api/admin/reload-prompts` to refresh

### Task 4: Debug an Issue

**Process**:

1. **Check health endpoint**:
```bash
curl http://localhost:8080/health
```

2. **Review logs** for error patterns:
```python
# Backend: Look for logger.error() calls
# Frontend: Check browser console (F12)
```

3. **Add debug logging**:
```python
logger.info(f"[Debug] Variable state: {var}")
```
```javascript
console.log('[Debug] State:', this.modifications);
```

4. **Test with minimal case**:
   - Create new session
   - Single operation
   - Check logs

5. **Check common issues**:
   - Session not found → Session ID mismatch
   - Iframe errors → Cross-origin issues
   - GCS errors → Credentials/permissions
   - Gemini errors → API key or rate limits

### Task 5: Update Frontend UI

**Steps**:

1. **Locate in `index.html`**:
   - Styles: `<style>` section (line 7+)
   - HTML: `<body>` section
   - Scripts: `<script>` section at end

2. **Add new UI element**:
```html
<div class="new-component">
    <button onclick="handleNewAction()">New Action</button>
</div>
```

3. **Add styles**:
```css
.new-component {
    padding: 15px;
    border-bottom: 1px solid #e0e0e0;
}
.new-component button {
    padding: 10px;
    background: #667eea;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
}
```

4. **Add handler**:
```javascript
function handleNewAction() {
    console.log('[NewAction] Triggered');
    // Call API or update state
}
```

---

## Important Considerations

### Security

⚠️ **Known Issues**:
- API key visible in code (`app_hp_support.py:26`)
- CORS enabled globally (potential CSRF)
- No input sanitization on imported HTML
- GCS public URLs generated for imported sites

**Best Practices**:
- Use environment variables for all secrets
- Validate and sanitize user input
- Implement rate limiting for AI endpoints
- Add authentication for admin endpoints

### Performance

**Optimization Points**:
- Prompt cache reduces GCS calls (60min TTL)
- Lazy TTS initialization
- GCS fallback with caching
- Single Gemini model instance reused

**Bottlenecks**:
- In-memory sessions (no persistence)
- Synchronous Gemini API calls
- Large HTML documents in `/api/save-html`

### Error Handling

**Common Error Patterns**:

1. **Session Not Found** (404):
```python
session = state.sessions.get(session_id)
if not session:
    return jsonify({"error": "Session not found"}), 404
```

2. **Invalid Input** (400):
```python
if not required_field:
    return jsonify({"success": False, "error": "..."}), 400
```

3. **External Service Failure** (500):
```python
try:
    response = requests.post(url, json=data, timeout=30)
except Exception as e:
    return jsonify({"success": False, "error": str(e)}), 500
```

### State Management

**Session Lifecycle**:
1. Created: `POST /api/sessions`
2. Updated: Throughout conversation
3. Destroyed: App restart (in-memory only)

**Session Data Growth**:
- `conversation_log` grows with each message
- `modifications` tracked client-side
- `fix_instructions` accumulates documents

⚠️ **Limitation**: No persistence → sessions lost on restart

### Frontend-Backend Contract

**Message Format** (Gemini → Frontend):
```javascript
{
    action: "immediate" | "batch" | "question",
    response: "User-facing message",
    modification: {
        selector: "CSS selector",
        type: "modification type",
        newValue: "new value",
        deleteText: "text to delete (optional)",
        description: "human-readable description"
    }
}
```

**Critical**: Frontend expects this exact structure from `/api/chat`

### iframe Sandbox

**Security Model**:
- Preview runs in `<iframe>` element
- PostMessage for cross-frame communication
- Same-origin policy considerations

**Injection Points**:
1. Base URL: `<base href="/preview/">` (line 209)
2. Selection script: Message passing to parent (line 215-246)

**DOM Access**:
```javascript
const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
```

⚠️ **Cross-origin limitation**: Only works for same-origin content

---

## Testing & Deployment

### Testing Strategy

**Current State**: No automated tests

**Manual Testing**:
1. Start service: `python app_hp_support.py`
2. Open browser: `http://localhost:8080`
3. Test flows:
   - Create session
   - Chat with modifications
   - Preview updates
   - Voice input/output
   - Export Word doc

**Recommended Testing**:
- Unit tests for `prompt_manager.py`
- Integration tests for API endpoints
- Frontend E2E tests (Playwright/Cypress)

### Local Development

**Setup**:
```bash
# Install dependencies (create requirements.txt first!)
pip install flask flask-cors google-generativeai \
    google-cloud-storage google-cloud-texttospeech \
    python-docx beautifulsoup4 requests gunicorn

# Set environment variables
export GEMINI_API_KEY="your-key"
export PROMPTS_BUCKET_NAME="your-bucket"
export ASTRO_BUILD_SERVICE_URL="http://localhost:3000"
# ... other env vars

# Run locally
python app_hp_support.py
```

**Port**: 8080 (default)

### Docker Deployment

**Build**:
```bash
docker build -t hp-support-service .
```

**Run**:
```bash
docker run -p 8080:8080 \
  -e GEMINI_API_KEY="..." \
  -e PROMPTS_BUCKET_NAME="..." \
  -e GOOGLE_APPLICATION_CREDENTIALS="/app/credentials.json" \
  hp-support-service
```

### Cloud Run Deployment

**Configuration**:
- Runtime: Python 3.11
- Server: Gunicorn (1 worker, 8 threads)
- Port: `$PORT` environment variable
- Timeout: 0 (unlimited)

**Environment Variables Required**:
```
GEMINI_API_KEY
PROMPTS_BUCKET_NAME
ASTRO_BUILD_SERVICE_URL
GCS_OUTPUT_BUCKET
GCS_OUTPUT_PATH
DEFAULT_PREVIEW_URL
```

**GCS Service Account**: Mounted via `GOOGLE_APPLICATION_CREDENTIALS`

**Health Check**: `GET /health`

### Monitoring

**Health Endpoint** (`/health`):
- Check service availability
- Verify external dependencies
- Monitor configuration status

**Logging**:
- Python: `logging` module (INFO level)
- JavaScript: Browser console
- Logs visible in Cloud Run console

**Key Metrics to Monitor**:
- Request rate to `/api/chat`
- Gemini API errors
- GCS access failures
- Session count (memory usage)

---

## Appendix: Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | ⚠️ Hardcoded | Google Gemini API key |
| `PROMPTS_BUCKET_NAME` | No | "" | GCS bucket for prompts |
| `ASTRO_BUILD_SERVICE_URL` | No | Cloud Run URL | Astro build service endpoint |
| `GCS_OUTPUT_BUCKET` | No | "gen-lang-client-..." | Preview output bucket |
| `GCS_OUTPUT_PATH` | No | "current" | Path prefix in bucket |
| `DEFAULT_PREVIEW_URL` | No | Firebase URL | Fallback preview URL |
| `PORT` | No | 8080 | Server port |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes (GCS) | - | Service account JSON path |

⚠️ **Action Required**: Remove hardcoded API key, use env var only

---

## Appendix: Recent Changes

Based on git history:

1. **Undo Functionality** (PR #8, commit 428941c)
   - Added `undo` modification type
   - Implemented modification stack
   - History tracking in `ModificationManager`

2. **Debug Logging** (commit 23db68e)
   - Extensive console logging in `modification.js`
   - Step-by-step execution traces
   - Error context preservation

3. **Partial Text Deletion** (PR #7, commit b6b7fd3)
   - `deleteText` parameter for partial deletion
   - Element vs text deletion logic
   - Fixed block deletion issue

4. **Concrete Gemini Examples** (commit bc5ed5f)
   - Added specific examples to prompts
   - Improved JSON response format
   - Better AI instruction following

---

## Appendix: Missing Components

⚠️ **Critical Gaps**:

1. **`requirements.txt`**: Not present in repository
   - Create with all dependencies listed in "Tech Stack"

2. **Session Persistence**: In-memory only
   - Consider Redis or database for production

3. **Automated Tests**: None
   - Add unit tests for business logic
   - Add integration tests for APIs

4. **API Documentation**: No OpenAPI spec
   - Consider adding Swagger/OpenAPI

5. **Error Recovery**: Limited
   - Add retry logic for external services
   - Implement circuit breakers

6. **Secrets Management**: Hardcoded API key
   - Use Secret Manager or env vars only

---

## Quick Reference Commands

```bash
# Health check
curl http://localhost:8080/health

# Create session
curl -X POST http://localhost:8080/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"caseType": "new"}'

# Reload prompts (admin)
curl -X POST http://localhost:8080/api/admin/reload-prompts

# List prompts (admin)
curl http://localhost:8080/api/admin/prompts

# Check git branch
git branch -a

# View logs (local)
tail -f *.log

# View logs (Cloud Run)
gcloud logging read "resource.type=cloud_run_revision"
```

---

## Contributing Guidelines for AI Assistants

When modifying this codebase:

1. ✅ **Always read relevant files first** before making changes
2. ✅ **Follow existing patterns** (error handling, logging, naming)
3. ✅ **Add logging** for new features (backend and frontend)
4. ✅ **Update CLAUDE.md** if architecture/APIs change
5. ✅ **Test manually** via browser before committing
6. ✅ **Write clear commit messages** following project style
7. ✅ **Use TodoWrite** for complex multi-step tasks
8. ✅ **Commit and push** when changes are complete
9. ❌ **Don't skip error handling** - always use try/catch
10. ❌ **Don't remove logging** - debugging relies on it

---

**Last Updated**: 2024-11-18
**Version**: 1.0
**Maintainer**: AI Assistant (Claude)
**Repository**: hp-support-service
