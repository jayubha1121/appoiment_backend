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

## cPanel deploy (Node.js app)

1. Set environment variables in cPanel:
   - `MONGODB_URI`
   - `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `FRONTEND_URL`

## Notes

- IDs are **Mongo ObjectIds**.
