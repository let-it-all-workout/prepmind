# PDF Exam Study Helper

A local web app that lets you:
- use an Orimise API key stored on your backend
- upload a lecture PDF
- generate exam-focused study notes automatically, including:
  - a brief of what the course is about
  - real-life use cases
  - deep exam-intelligence notes

## Run

```bash
npm install
npm run dev
```

Create a `.env` file in project root:

```bash
ORIMISE_API_KEY=your_secret_key
ORIMISE_ENDPOINT=https://your-host/v1/chat/completions
ORIMISE_MODEL=your_default_model
ORIMISE_MODEL_STUDY=gpt-5
ORIMISE_MODEL_QUIZ=gemini-3.1-pro
ORIMISE_MODEL_GRADE=gemini-3.1-pro
```

Open:

`http://localhost:3000`

## What to fill in the page

- **Model**: optional manual override; if empty backend uses per-task models from `.env`
- **Exam Focus**: optional topic emphasis

## Notes

- PDF max size is 25MB.
- App extracts PDF text, chunks it, summarizes each chunk, then merges into one final exam sheet.
- The API key never goes through the browser and stays on backend only.
- User config is saved in browser local storage (non-secret fields only).
