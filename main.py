from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles

app = FastAPI()
templates = Jinja2Templates(directory=".")

# Mount the addon directories so they can be downloaded/accessed
app.mount("/addons/nina", StaticFiles(directory="NINA"), name="addon-nina")
app.mount("/addons/nina-flow", StaticFiles(directory="Nina Flow"), name="addon-nina-flow")

SUPPORTED_LANGUAGES = ["ar", "bn", "de", "en", "es", "fr", "hi", "it", "pt", "ru", "zh"]

@app.get("/")
async def root(request: Request):
    accept_language = request.headers.get("accept-language", "")
    lang_code = "en" # fallback
    if accept_language:
        langs = [lang.split(';')[0].split('-')[0].lower() for lang in accept_language.split(',')]
        for lang in langs:
            if lang in SUPPORTED_LANGUAGES:
                lang_code = lang
                break
    
    return RedirectResponse(url=f"/{lang_code}/")

@app.get("/{lang}/", response_class=HTMLResponse)
async def serve_lang(request: Request, lang: str):
    if lang not in SUPPORTED_LANGUAGES:
        return RedirectResponse(url="/en/")
    
    return templates.TemplateResponse("index.html", {"request": request, "lang": lang})
