"""Ensure the installed application serves its UI and bundled example."""
from fastapi.testclient import TestClient
from app.main import create_app
from app.imports.schemas import QuestionInput


def test_ui_assets_and_sample(tmp_path, monkeypatch):
    monkeypatch.setenv('NEETPG2027_DATABASE_URL', f"sqlite:///{tmp_path / 'ui.sqlite'}")
    app = create_app()
    with TestClient(app) as client:
        response = client.get('/')
        assert response.status_code == 200
        assert 'Import &amp; review' in response.text or 'Import & review' in response.text
        assert 'id="confirmation"' in response.text
        assert 'charset="utf-8"' in response.text
        for name, mime in [('imports.css', 'text/css'), ('imports.js', 'javascript')]:
            response = client.get(f'/static/{name}')
            assert response.status_code == 200
            assert mime in response.headers['content-type']
        sample = client.get('/static/sample.json').json()
        assert len(sample) == 1
        assert QuestionInput.model_validate(sample[0]).external_id == 'synthetic-001'
        assert client.get('/static/not-a-file').status_code == 404
    app.state.engine.dispose()
