from fastapi import FastAPI

app = FastAPI(title="catalog-service")


@app.get("/health")
def health():
    return {"status": "ok"}
