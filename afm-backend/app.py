"""Application entrypoint for the AFM backend."""

from app_factory import create_app
from settings import DEBUG, HOST, PORT

app = create_app()


if __name__ == "__main__":
    app.run(host=HOST, port=PORT, debug=DEBUG)
