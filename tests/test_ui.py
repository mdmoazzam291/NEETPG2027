"""Ensure the installed application serves its UI and bundled examples."""
from fastapi.testclient import TestClient

from app.imports.schemas import QuestionInput
from app.main import create_app


def test_ui_assets_and_sample(tmp_path, monkeypatch):
    monkeypatch.setenv('NEETPG2027_DATABASE_URL', f"sqlite:///{tmp_path / 'ui.sqlite'}")
    monkeypatch.setenv('NEETPG2027_MEDIA_ROOT', str(tmp_path / 'media'))
    app = create_app()
    with TestClient(app) as client:
        response = client.get('/')
        assert response.status_code == 200
        assert 'Import &amp; review' in response.text or 'Import & review' in response.text
        assert 'href="/taxonomy"' in response.text
        assert 'id="confirmation"' in response.text
        assert 'charset="utf-8"' in response.text

        taxonomy = client.get('/taxonomy')
        assert taxonomy.status_code == 200
        assert '<h1>Taxonomy</h1>' in taxonomy.text
        assert 'id="topic-form"' in taxonomy.text

        media = client.get('/media')
        assert media.status_code == 200
        assert '<h1>Question media</h1>' in media.text
        assert 'id="media-form"' in media.text

        study = client.get('/study')
        assert study.status_code == 200
        assert '<h1>Study session</h1>' in study.text
        assert 'id="question-panel"' in study.text
        assert 'id="confidence"' in study.text

        for name, mime in [('imports.css', 'text/css'), ('imports.js', 'javascript'),
                           ('taxonomy.css', 'text/css'), ('taxonomy.js', 'javascript'),
                           ('media.css', 'text/css'), ('media.js', 'javascript'),
                           ('study.css', 'text/css'), ('study.js', 'javascript')]:
            asset = client.get(f'/static/{name}')
            assert asset.status_code == 200
            assert mime in asset.headers['content-type']
        sample = client.get('/static/sample.json').json()
        assert len(sample) == 1
        assert QuestionInput.model_validate(sample[0]).external_id == 'synthetic-001'
        assert client.get('/static/not-a-file').status_code == 404
    app.state.engine.dispose()
