# PC1 / PC2 / PC3 connection setup

## Local all-in-one

Run all three on this Windows machine:

```powershell
cd C:\groom
.\run-pc123-local.ps1
.\test-pc123-local.ps1
```

Default local endpoints:

- PC1 frontend: `http://localhost:1420`
- PC2 coach API: `http://127.0.0.1:7000`
- PC3 vision gateway: `http://127.0.0.1:9000`

The local PC2 setup uses SQLite at `pc2_coach_server/data/pc2_local.sqlite3`, so Docker/PostgreSQL is not required for transport checks.

## Physical split

Only the URL values change. Keep each server bound to `0.0.0.0`.

PC1 `.env`:

```env
VITE_PC3_URL=http://<PC3_LAN_IP>:9000
VITE_DEVICE_ID=mirror_001
```

PC3 `.env`:

```env
HOST=0.0.0.0
PORT=9000
WS_PUBLIC_HOST=<PC3_LAN_IP>
PC2_COACH_API_URL=http://<PC2_LAN_IP>:7000/api/coach/generate
PC2_ROUTINE_API_URL=http://<PC2_LAN_IP>:7000/api/routine/profile
PC2_ROUTINE_DAY_API_URL=http://<PC2_LAN_IP>:7000/api/routine/profile/{user_id}/day
MOCK_LLM=false
```

PC2 `.env`:

```env
HOST=0.0.0.0
PORT=7000
DATABASE_URL=sqlite:///./data/pc2_local.sqlite3
```

Connection direction:

- PC1 calls PC3 over HTTP and WebSocket.
- PC3 calls PC2 over HTTP.
- PC1 does not call PC2 directly.

When PC1 is packaged with Tauri, `VITE_PC3_URL` is baked into the build. If the PC3 IP changes, update PC1 `.env` and rebuild the installer.
