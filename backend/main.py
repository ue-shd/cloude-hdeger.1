import os
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
import anthropic

from database import Task, Priority, get_db, init_db

app = FastAPI(title="タスク管理 & 提案システム")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
app.mount("/static", StaticFiles(directory=frontend_path), name="static")


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    priority: Optional[Priority] = Priority.medium
    category: Optional[str] = ""
    due_date: Optional[str] = ""


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[Priority] = None
    completed: Optional[bool] = None
    category: Optional[str] = None
    due_date: Optional[str] = None


class SuggestionRequest(BaseModel):
    context: Optional[str] = ""
    existing_tasks: Optional[List[str]] = []


@app.get("/")
def root():
    return FileResponse(os.path.join(frontend_path, "index.html"))


@app.get("/tasks")
def list_tasks(db: Session = Depends(get_db)):
    return db.query(Task).order_by(Task.created_at.desc()).all()


@app.post("/tasks", status_code=201)
def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    db_task = Task(**task.model_dump())
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task


@app.patch("/tasks/{task_id}")
def update_task(task_id: int, update: TaskUpdate, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    for field, value in update.model_dump(exclude_none=True).items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return task


@app.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()


@app.post("/suggest")
def suggest_tasks(req: SuggestionRequest, db: Session = Depends(get_db)):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        # fallback: rule-based suggestions
        return _rule_based_suggestions(req, db)

    existing = db.query(Task).filter(Task.completed == False).all()
    task_list = "\n".join(
        f"- [{t.priority}] {t.title} ({t.category or '未分類'})" for t in existing
    )
    user_context = req.context or "特になし"

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=(
            "あなたはタスク管理のエキスパートアシスタントです。"
            "ユーザーの現在のタスク一覧と状況を分析して、"
            "追加すべき有益なタスクを3〜5件提案してください。"
            "各提案は JSON 配列で返してください。"
            '形式: [{"title": "...", "description": "...", "priority": "low|medium|high", "category": "..."}]'
            "余計な説明は不要です。JSON のみ返してください。"
        ),
        messages=[
            {
                "role": "user",
                "content": (
                    f"現在のタスク:\n{task_list or '(なし)'}\n\n"
                    f"状況・コンテキスト: {user_context}"
                ),
            }
        ],
    )

    import json
    text = message.content[0].text.strip()
    # Extract JSON array from response
    start = text.find("[")
    end = text.rfind("]") + 1
    if start != -1 and end > start:
        suggestions = json.loads(text[start:end])
    else:
        suggestions = []
    return {"suggestions": suggestions}


def _rule_based_suggestions(req: SuggestionRequest, db: Session):
    existing = db.query(Task).filter(Task.completed == False).all()
    categories = set(t.category for t in existing if t.category)

    suggestions = []
    if not any(t.priority == "high" for t in existing):
        suggestions.append({
            "title": "優先度の高いタスクを確認する",
            "description": "現在、優先度Highのタスクがありません。重要な作業を見直しましょう。",
            "priority": "high",
            "category": "管理",
        })
    if len(existing) > 5:
        suggestions.append({
            "title": "タスクの棚卸しを行う",
            "description": "タスクが多くなっています。不要なものを削除・整理しましょう。",
            "priority": "medium",
            "category": "管理",
        })
    suggestions.append({
        "title": "週次レビューを実施する",
        "description": "今週の進捗を振り返り、来週の計画を立てましょう。",
        "priority": "medium",
        "category": "計画",
    })
    suggestions.append({
        "title": "ドキュメントを更新する",
        "description": "作業内容をドキュメントに記録しておきましょう。",
        "priority": "low",
        "category": "ドキュメント",
    })
    return {"suggestions": suggestions[:4]}
