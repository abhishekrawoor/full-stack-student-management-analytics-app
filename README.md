# Student Management Dashboard

A complete student management app with:

- User register and login
- JWT authentication
- Protected dashboard
- Total students, average marks, pass percentage, and top performers
- Bar chart, pie chart, and line chart analytics
- Add, edit, and delete student records
- JSON file persistence
- No external npm dependencies

## Requirements

- Node.js 18 or newer

## Run

```bash
npm start
```

Open:

```text
http://localhost:3000
```

## Default Behavior

The app stores users and students in:

```text
data/database.json
```

On first run, the database file is created automatically with sample students.

## API Summary

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/students`
- `POST /api/students`
- `PUT /api/students/:id`
- `DELETE /api/students/:id`
- `GET /api/analytics`

Protected routes require:

```text
Authorization: Bearer <jwt_token>
```
