# API Documentation

The SEO Automation System provides a comprehensive REST API for managing profiles, tasks, and monitoring system performance.

## Authentication

All API requests require authentication using an API key.

```bash
# Using header
curl -H "X-API-Key: your-api-key" https://api.example.com/api/profiles

# Using query parameter
curl https://api.example.com/api/profiles?api_key=your-api-key
```

## Base URL

```
https://your-server.com/api
```

## Response Format

All responses follow this format:

```json
{
  "success": true,
  "data": { ... },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

Error responses:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

## Endpoints

### Profiles

#### List Profiles
```http
GET /profiles
```

Query parameters:
- `status` - Filter by status (pending, running, completed, failed)
- `type` - Filter by task type
- `profile_id` - Filter by profile
- `priority` - Filter by priority level
- `date_from` - Tasks created after this date
- `date_to` - Tasks created before this date
- `page` - Page number
- `limit` - Items per page

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "task-456",
      "type": "search",
      "status": "completed",
      "profileId": "profile-123",
      "priority": 5,
      "config": {
        "search": {
          "engine": "yandex",
          "query": "купить телефон",
          "targetDomain": "example.com"
        }
      },
      "result": {
        "success": true,
        "position": 15,
        "duration": 185000
      }
    }
  ],
  "pagination": { ... }
}
```

#### Get Task
```http
GET /tasks/:id
```

#### Create Task
```http
POST /tasks
```

Request body:
```json
{
  "type": "search",
  "profileId": "profile-123",
  "priority": 5,
  "config": {
    "search": {
      "engine": "yandex",
      "query": "купить телефон москва",
      "targetDomain": "example.com",
      "maxResultPages": 5,
      "region": "Moscow"
    }
  },
  "schedule": {
    "type": "immediate"
  }
}
```

#### Bulk Create Tasks
```http
POST /tasks/bulk
```

Request body:
```json
{
  "tasks": [
    {
      "type": "search",
      "query": "query 1",
      "targetDomain": "example.com"
    },
    {
      "type": "search",
      "query": "query 2",
      "targetDomain": "example.com"
    }
  ],
  "options": {
    "profileCount": 20,
    "engine": "yandex",
    "schedule": "distributed",
    "priority": 5
  }
}
```

#### Cancel Task
```http
DELETE /tasks/:id
POST /tasks/:id/cancel
```

#### Retry Failed Task
```http
POST /tasks/:id/retry
```

#### Get Task Statistics
```http
GET /tasks/stats
```

Query parameters:
- `period` - Time period (today, week, month, custom)
- `group_by` - Group by field (type, status, profile)

### Metrics

#### Get Current Metrics
```http
GET /metrics/current
```

Response:
```json
{
  "success": true,
  "data": {
    "profiles": {
      "total": 200,
      "active": 156,
      "warming": 20,
      "suspended": 24,
      "avgHealth": 78.5
    },
    "tasks": {
      "pending": 45,
      "running": 10,
      "completed": 1234,
      "failed": 56,
      "successRate": 0.956
    },
    "searches": {
      "total": 5678,
      "byEngine": {
        "yandex": 3456,
        "google": 2222
      }
    },
    "resources": {
      "cpu": 45.2,
      "memory": 62.8,
      "browsers": {
        "active": 8,
        "available": 2
      }
    }
  }
}
```

#### Get Search Positions
```http
GET /metrics/positions
```

Query parameters:
- `domain` - Filter by domain
- `engine` - Filter by search engine
- `period` - Time period for comparison

Response:
```json
{
  "success": true,
  "data": [
    {
      "query": "купить телефон",
      "engine": "yandex",
      "currentPosition": 12,
      "previousPosition": 18,
      "change": 6,
      "trend": "improving",
      "lastChecked": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Get Performance Metrics
```http
GET /metrics/performance
```

Query parameters:
- `period` - Time period
- `interval` - Data point interval (hour, day, week)

#### Get Cost Analysis
```http
GET /metrics/costs
```

Query parameters:
- `period` - Time period
- `breakdown` - Show cost breakdown by category

Response:
```json
{
  "success": true,
  "data": {
    "total": 125.50,
    "breakdown": {
      "proxies": 85.00,
      "captcha": 25.50,
      "infrastructure": 15.00
    },
    "daily_average": 4.18,
    "cost_per_task": 0.025
  }
}
```

### System

#### Get System Status
```http
GET /system/status
```

Response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 432000,
    "version": "1.0.0",
    "components": {
      "database": {
        "status": "healthy",
        "responseTime": 12
      },
      "browserPool": {
        "status": "healthy",
        "active": 8,
        "available": 2
      },
      "taskQueue": {
        "status": "healthy",
        "pending": 45,
        "processing": 10
      }
    }
  }
}
```

#### Health Check
```http
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00Z",
  "uptime": 432000,
  "memory": {
    "used": 512000000,
    "total": 8192000000
  }
}
```

#### Start/Stop System
```http
POST /system/start
POST /system/stop
POST /system/restart
```

#### Emergency Stop
```http
POST /system/emergency-stop
```

Request body:
```json
{
  "reason": "Manual emergency stop",
  "force": true
}
```

#### Get System Configuration
```http
GET /system/config
```

Note: Returns non-sensitive configuration values only.

#### Update Configuration
```http
PUT /system/config
```

Request body:
```json
{
  "MAX_CONCURRENT_TASKS": 15,
  "BROWSER_POOL_SIZE": 12
}
```

### Reports

#### Generate Report
```http
POST /reports/generate
```

Request body:
```json
{
  "type": "weekly",
  "period": {
    "start": "2024-01-08",
    "end": "2024-01-14"
  },
  "format": "pdf",
  "sections": ["summary", "positions", "tasks", "costs"]
}
```

#### List Reports
```http
GET /reports
```

#### Download Report
```http
GET /reports/:id/download
```

### Alerts

#### List Alerts
```http
GET /alerts
```

Query parameters:
- `level` - Filter by level (info, warning, error, critical)
- `acknowledged` - Filter by acknowledgment status
- `resolved` - Filter by resolution status

#### Acknowledge Alert
```http
POST /alerts/:id/acknowledge
```

#### Resolve Alert
```http
POST /alerts/:id/resolve
```

## WebSocket API

Connect to WebSocket for real-time updates:

```javascript
const socket = io('wss://your-server.com', {
  auth: {
    token: 'your-api-key'
  }
});

// Subscribe to events
socket.emit('metrics:subscribe');
socket.emit('profiles:subscribe');
socket.emit('tasks:subscribe');

// Listen for updates
socket.on('metrics:update', (data) => {
  console.log('Metrics updated:', data);
});

socket.on('profile:updated', (profile) => {
  console.log('Profile updated:', profile);
});

socket.on('task:completed', (task) => {
  console.log('Task completed:', task);
});
```

## Rate Limiting

API requests are rate limited:
- Default: 100 requests per 15 minutes
- Bulk operations: 10 requests per hour

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642248000
```

## Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Invalid request parameters |
| `AUTHENTICATION_ERROR` | Missing or invalid API key |
| `AUTHORIZATION_ERROR` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `QUOTA_EXCEEDED` | Account quota exceeded |
| `INTERNAL_ERROR` | Server error |

## Examples

### cURL Examples

Create profiles:
```bash
curl -X POST https://api.example.com/api/profiles \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "count": 10,
    "options": {
      "region": "Moscow",
      "deviceType": "desktop"
    }
  }'
```

Create search task:
```bash
curl -X POST https://api.example.com/api/tasks \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "search",
    "profileId": "profile-123",
    "config": {
      "search": {
        "engine": "yandex",
        "query": "test query",
        "targetDomain": "example.com"
      }
    }
  }'
```

### JavaScript/Node.js Example

```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'https://api.example.com/api',
  headers: {
    'X-API-Key': 'your-api-key'
  }
});

// Get profiles
async function getProfiles() {
  const response = await api.get('/profiles', {
    params: {
      status: 'active',
      health_min: 70
    }
  });
  return response.data;
}

// Create task
async function createTask(profileId, query, target) {
  const response = await api.post('/tasks', {
    type: 'search',
    profileId: profileId,
    config: {
      search: {
        engine: 'yandex',
        query: query,
        targetDomain: target
      }
    }
  });
  return response.data;
}
```

### Python Example

```python
import requests

API_KEY = 'your-api-key'
BASE_URL = 'https://api.example.com/api'

headers = {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
}

# Get current metrics
response = requests.get(f'{BASE_URL}/metrics/current', headers=headers)
metrics = response.json()

# Create profiles
data = {
    'count': 5,
    'options': {
        'region': 'Moscow',
        'deviceType': 'desktop'
    }
}
response = requests.post(f'{BASE_URL}/profiles', json=data, headers=headers)
result = response.json()
``` (active, warming, suspended)
- `health_min` - Minimum health score
- `region` - Filter by region
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "profile-123",
      "status": "active",
      "health": {
        "score": 85,
        "factors": { ... }
      },
      "identity": { ... },
      "stats": { ... }
    }
  ],
  "pagination": { ... }
}
```

#### Get Profile
```http
GET /profiles/:id
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "profile-123",
    "status": "active",
    "created": "2024-01-01T00:00:00Z",
    "health": { ... },
    "identity": { ... },
    "fingerprint": { ... },
    "behavior": { ... },
    "stats": { ... }
  }
}
```

#### Create Profiles
```http
POST /profiles
```

Request body:
```json
{
  "count": 10,
  "options": {
    "region": "Moscow",
    "deviceType": "desktop",
    "warmup": true
  }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "created": 10,
    "profiles": [...]
  }
}
```

#### Update Profile
```http
PUT /profiles/:id
```

Request body:
```json
{
  "status": "suspended",
  "suspendedReason": "Low health score"
}
```

#### Delete Profile
```http
DELETE /profiles/:id
```

#### Profile Actions

##### Warmup Profile
```http
POST /profiles/:id/warmup
```

Request body:
```json
{
  "days": 14
}
```

##### Suspend Profile
```http
POST /profiles/:id/suspend
```

Request body:
```json
{
  "reason": "Manual suspension"
}
```

##### Resume Profile
```http
POST /profiles/:id/resume
```

##### Get Profile History
```http
GET /profiles/:id/history
```

Query parameters:
- `date_from` - Start date
- `date_to` - End date
- `action_type` - Filter by action type
- `limit` - Number of records

### Tasks

#### List Tasks
```http
GET /tasks
```

Query parameters:
- `status` - Filter by status