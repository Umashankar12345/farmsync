"""
run_pipeline.py  —  Run all pipeline phases in order.
Stops at the first failure.  Run from the project root:

  .\venv\Scripts\python run_pipeline.py
"""
import subprocess, sys, os

ROOT = os.path.dirname(os.path.abspath(__file__))
PYTHON = os.path.join(ROOT, "venv", "Scripts", "python.exe")
if not os.path.exists(PYTHON):
    PYTHON = sys.executable  # fall back to system python

steps = [
    ([PYTHON, "pipeline/fetch.py"],      "Phase 1: Fetch Sentinel-2 scenes"),
    ([PYTHON, "pipeline/indices.py"],    "Phase 2: Compute indices"),
    ([PYTHON, "pipeline/yield_risk.py"], "Phase 3: Zones + risk"),
    ([PYTHON, "pipeline/export.py"],     "Phase 4: Export PNGs + meta.json"),
]

for cmd, label in steps:
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"{'='*60}")
    result = subprocess.run(cmd, cwd=ROOT)
    if result.returncode != 0:
        print(f"\nSTOP: {label} failed (exit {result.returncode}).")
        print("Fix the error above before continuing.")
        sys.exit(result.returncode)

print("\n" + "="*60)
print("  All pipeline phases complete.")
print("  Start the API: .\\venv\\Scripts\\python api/app.py")
print("  Start the UI : npm run dev")
print("="*60)
