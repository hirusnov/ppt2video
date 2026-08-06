import requests, base64, os

PPTX = os.path.join(os.environ["TEMP"], "test_ppt2video.pptx")
with open(PPTX, "rb") as f:
    r = requests.post(
        "http://localhost:8000/api/extract-slides",
        files={"pptx": ("test.pptx", f)},
    )

print("Status:", r.status_code)
if r.ok:
    d = r.json()
    print("totalSlides:", d["totalSlides"])
    for s in d["slides"]:
        kb = len(base64.b64decode(s["thumbnail"])) // 1024
        title_preview = repr(s["title"][:40])
        body_count = len(s["body"])
        print(f"  Slide {s['index']}: title={title_preview} body={body_count} lines thumb={kb}KB hasPic={s['hasPicture']}")
    print("PASS")
else:
    print("ERROR:", r.text[:500])
