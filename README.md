# Appointment Backend (MongoDB)

This backend is a Node.js/Express API for appointment slot booking.

## Environment variables

- **MONGODB_URI**: MongoDB connection string
- **JWT_SECRET**: admin JWT secret
- **ADMIN_EMAIL / ADMIN_PASSWORD**: admin login credentials
- **FRONTEND_URL**: allowed CORS origin + OAuth redirect destination
- **GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI**: optional Google Calendar integration

## Local development

1. Set `MONGODB_URI` in `appointment_backend/.env`
   - For a local MongoDB instance, use a valid URI such as `mongodb://127.0.0.1:27017/your_database` (without spaces).
   - Do not use `127.0.0.1` for Railway-hosted MongoDB; on Railway it points to the backend container itself.
2. Install:

```bash
cd appointment_backend
npm install
```

3. Run:

```bash
npm run dev
```

## Railway deploy

1. Add MongoDB (or provide your own MongoDB URL).
2. Set variables:
   - `MONGODB_URI`
   - `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `FRONTEND_URL`
3. For Railway-hosted MongoDB, set the backend's `MONGODB_URI` to a Railway reference variable for the MongoDB service's `MONGO_URL` (for example, `${{Mongo.MONGO_URL}}`, using your actual MongoDB service name). Keep both services in the same Railway project and environment so the private hostname resolves. Do not paste credentials into source files or logs.
4. After deployment, verify `/health` reports `database.isConnected: true` and `database.readyState: 1`. If it does not, inspect the backend logs for the sanitized MongoDB connection diagnostic and check the MongoDB service's network and authentication configuration.
5. Deployment-provided variables take precedence over local `.env` values. The server makes a bounded initial connection attempt before listening; if MongoDB is unavailable, health remains available and database-backed routes return 503 while bounded-backoff connection retries continue.

## cPanel deploy (Node.js app)

1. Set environment variables in cPanel:
   - `MONGODB_URI`
   - `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `FRONTEND_URL`

## Notes

- IDs are **Mongo ObjectIds**.
