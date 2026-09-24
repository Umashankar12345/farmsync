"""
scripts/check_no_fake.py
─────────────────────────
Fails if any fake-data patterns exist in src/ or pipeline/.
Run: python scripts/check_no_fake.py
"""

import os, sys, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Patterns that indicate fake/random data
FORBIDDEN_PATTERNS = [
    (r'\bMath\.random\b',             "Math.random() — random data"),
    (r'\bnp\.random\b',               "np.random — random data (in pipeline code)"),
    (r'\bfaker\b',                    "faker library"),
    (r'mockData',                     "mockData import (should be replaced by API calls)"),
    (r'\b(demo|fake|dummy|placeholder|sample)\s*=',
                                      "Variable named demo/fake/dummy/placeholder/sample"),
    (r'# TODO.*data',                 "TODO data comment"),
]

# File extensions to scan
SCAN_EXTS = {".jsx", ".js", ".ts", ".tsx", ".py"}

# Paths to skip
SKIP_DIRS = {"node_modules", ".git", "venv", "dist", "__pycache__", ".gemini"}

# Files explicitly allowed to reference mockData (the module itself)
ALLOWLIST = {
    os.path.join(ROOT, "src", "data", "mockData.js"),  # the module, not an import
}

errors = []

for dirpath, dirnames, filenames in os.walk(ROOT):
    # Prune skipped dirs
    dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

    for fname in filenames:
        ext = os.path.splitext(fname)[1]
        if ext not in SCAN_EXTS:
            continue
        fpath = os.path.join(dirpath, fname)
        if fpath in ALLOWLIST:
            continue
        try:
            with open(fpath, encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
        except Exception:
            continue
        for i, line in enumerate(lines, 1):
            for pattern, label in FORBIDDEN_PATTERNS:
                if re.search(pattern, line):
                    rel = os.path.relpath(fpath, ROOT)
                    errors.append(f"  {rel}:{i}  [{label}]  →  {line.rstrip()}")

if errors:
    print(f"FAIL — {len(errors)} forbidden pattern(s) found:\n")
    for e in errors:
        print(e)
    sys.exit(1)
else:
    print("PASS — no fake/random data patterns found.")
