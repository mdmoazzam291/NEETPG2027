"""Non-destructive local taxonomy administration API."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app.db.models import LifecycleStatus, Subject, Subtopic, System, Topic
from app.imports.api import database
from app.taxonomy.schemas import (
    SubjectEdit, SubjectInput, SubjectSystemInput, SubtopicEdit, SubtopicInput,
    SystemEdit, SystemInput, TopicEdit, TopicInput,
)

router = APIRouter(prefix="/api/taxonomy", tags=["taxonomy"])


def get_or_404(session, model, identity, label):
    value = session.get(model, identity)
    if value is None:
        raise HTTPException(404, f"{label} not found")
    return value


def resolve_many(session, model, identities, label):
    values = []
    for identity in identities:
        values.append(get_or_404(session, model, identity, label))
    return values


def subject_view(subject):
    return {"id": subject.id, "name": subject.name, "code": subject.code,
            "system_ids": sorted(system.id for system in subject.systems),
            "topic_ids": sorted(topic.id for topic in subject.topics)}


def system_view(system):
    return {"id": system.id, "name": system.name,
            "subject_ids": sorted(subject.id for subject in system.subjects),
            "topic_ids": sorted(topic.id for topic in system.topics)}


def subtopic_view(subtopic):
    return {"id": subtopic.id, "topic_id": subtopic.topic_id, "name": subtopic.name,
            "description": subtopic.description, "lifecycle_status": subtopic.lifecycle_status.value}


def topic_view(topic):
    return {"id": topic.id, "name": topic.name, "description": topic.description,
            "lifecycle_status": topic.lifecycle_status.value,
            "subject_ids": sorted(subject.id for subject in topic.subjects),
            "system_ids": sorted(system.id for system in topic.systems),
            "subtopics": [subtopic_view(item) for item in sorted(topic.subtopics, key=lambda item: (item.name.casefold(), item.id))]}


@router.get("")
def snapshot(session=Depends(database)):
    subjects = list(session.scalars(select(Subject).order_by(Subject.name, Subject.id)))
    systems = list(session.scalars(select(System).order_by(System.name, System.id)))
    topics = list(session.scalars(select(Topic).order_by(Topic.name, Topic.id)))
    return {"subjects": [subject_view(item) for item in subjects],
            "systems": [system_view(item) for item in systems],
            "topics": [topic_view(item) for item in topics]}


@router.post("/subjects", status_code=201)
def create_subject(payload: SubjectInput, session=Depends(database)):
    subject = Subject(name=payload.name, code=payload.code)
    session.add(subject)
    session.flush()
    return subject_view(subject)


@router.patch("/subjects/{subject_id}")
def edit_subject(subject_id: int, payload: SubjectEdit, session=Depends(database)):
    subject = get_or_404(session, Subject, subject_id, "subject")
    if "name" in payload.model_fields_set:
        subject.name = payload.name
    if "code" in payload.model_fields_set:
        subject.code = payload.code
    session.flush()
    return subject_view(subject)


@router.post("/systems", status_code=201)
def create_system(payload: SystemInput, session=Depends(database)):
    system = System(name=payload.name)
    session.add(system)
    session.flush()
    return system_view(system)


@router.patch("/systems/{system_id}")
def edit_system(system_id: int, payload: SystemEdit, session=Depends(database)):
    system = get_or_404(session, System, system_id, "system")
    if "name" in payload.model_fields_set:
        system.name = payload.name
    session.flush()
    return system_view(system)


@router.post("/subject-systems", status_code=201)
def link_subject_system(payload: SubjectSystemInput, session=Depends(database)):
    subject = get_or_404(session, Subject, payload.subject_id, "subject")
    system = get_or_404(session, System, payload.system_id, "system")
    created = system not in subject.systems
    if created:
        subject.systems.append(system)
        session.flush()
    return {"subject_id": subject.id, "system_id": system.id, "created": created}


@router.post("/topics", status_code=201)
def create_topic(payload: TopicInput, session=Depends(database)):
    topic = Topic(name=payload.name, description=payload.description)
    topic.subjects = resolve_many(session, Subject, payload.subject_ids, "subject")
    topic.systems = resolve_many(session, System, payload.system_ids, "system")
    session.add(topic)
    session.flush()
    return topic_view(topic)


@router.patch("/topics/{topic_id}")
def edit_topic(topic_id: int, payload: TopicEdit, session=Depends(database)):
    topic = get_or_404(session, Topic, topic_id, "topic")
    fields = payload.model_fields_set
    if "name" in fields:
        topic.name = payload.name
    if "description" in fields:
        topic.description = payload.description
    if "lifecycle_status" in fields:
        topic.lifecycle_status = LifecycleStatus(payload.lifecycle_status)
    if "subject_ids" in fields:
        topic.subjects = resolve_many(session, Subject, payload.subject_ids or [], "subject")
    if "system_ids" in fields:
        topic.systems = resolve_many(session, System, payload.system_ids or [], "system")
    session.flush()
    return topic_view(topic)


@router.post("/subtopics", status_code=201)
def create_subtopic(payload: SubtopicInput, session=Depends(database)):
    get_or_404(session, Topic, payload.topic_id, "topic")
    subtopic = Subtopic(topic_id=payload.topic_id, name=payload.name, description=payload.description)
    session.add(subtopic)
    session.flush()
    return subtopic_view(subtopic)


@router.patch("/subtopics/{subtopic_id}")
def edit_subtopic(subtopic_id: int, payload: SubtopicEdit, session=Depends(database)):
    subtopic = get_or_404(session, Subtopic, subtopic_id, "subtopic")
    fields = payload.model_fields_set
    if "topic_id" in fields:
        get_or_404(session, Topic, payload.topic_id, "topic")
        subtopic.topic_id = payload.topic_id
    if "name" in fields:
        subtopic.name = payload.name
    if "description" in fields:
        subtopic.description = payload.description
    if "lifecycle_status" in fields:
        subtopic.lifecycle_status = LifecycleStatus(payload.lifecycle_status)
    session.flush()
    return subtopic_view(subtopic)
