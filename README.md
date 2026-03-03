# NumPad OCR Calculator

NumPad OCR Calculator is a fully client-side visual calculator that extracts numbers from images using OCR and lets you construct mathematical expressions via drag-and-drop on an interactive canvas.

No server. No backend. Everything runs locally in the browser.

---

## Features

- OCR-based number extraction from uploaded images
- Drag-and-drop number blocks onto a grid canvas
- Operator palette (+, −, ×, ÷)
- Automatic expression grouping based on horizontal alignment
- Real-time calculation
- Manual number input and editing
- Drag-to-delete interaction
- Security hardening via CSP and resource restrictions

---

## How It Works

1. Upload an image containing numbers.
2. Extracted numbers appear in the left panel.
3. Drag numbers and operators onto the canvas.
4. Arrange them horizontally to form expressions.
5. Valid alternating sequences are automatically evaluated.
6. Results update dynamically as blocks move.

All OCR processing is powered by Tesseract.js and executed locally in the browser.

---

## Running the Project

Clone the repository:

```bash
git clone https://github.com/yourusername/numpad-ocr-calculator.git

Open index.html in a modern browser
(or deploy via GitHub Pages for proper worker handling).

No build step required.

Security

Strict Content Security Policy (CSP)

Worker isolation

File size and element count limitations

No external data transmission

AI-Assisted Development

This project was developed with AI-assisted architecture review, refactoring guidance, and security analysis.
System design and implementation decisions were directed and validated by the developer.

License

MIT
