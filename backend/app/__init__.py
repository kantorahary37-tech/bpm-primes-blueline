import os

def _load_env_file(path):
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass

_load_env_file(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
