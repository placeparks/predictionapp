import sys
from pathlib import Path

try:
    from pypdf import PdfReader
except Exception as e:
    print("Missing dependency: pypdf. Install with: python -m pip install pypdf", file=sys.stderr)
    sys.exit(2)


def main():
    if len(sys.argv) < 2:
        print("Usage: read_pdf_text.py <PDF_PATH>", file=sys.stderr)
        sys.exit(1)

    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        print(f"File not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    reader = PdfReader(str(pdf_path))
    out = sys.stdout.buffer
    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        chunk = f"--- Page {i} ---\n{text.strip()}\n\n".encode("utf-8", "replace")
        out.write(chunk)
    out.flush()


if __name__ == "__main__":
    main()
