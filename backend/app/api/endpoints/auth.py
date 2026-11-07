import re
from datetime import timedelta
from fastapi import APIRouter, HTTPException, status, Depends, Request
from fastapi.security import OAuth2PasswordBearer
from app.models.user import UserCreate, UserInDB, User
from app.core.security import get_password_hash, verify_password, create_access_token
from app.db.mongodb import db
from app.db.neo4j_db import neo4j_db

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


@router.post("/register", response_model=User)
async def register(user: UserCreate):
    database = db.get_db()
    clean_email = user.email.strip().lower()
    existing_user = await database["users"].find_one({
        "email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}
    })
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_password = get_password_hash(user.password)
    user_in_db = UserInDB(email=clean_email, hashed_password=hashed_password)

    new_user = await database["users"].insert_one(user_in_db.model_dump())
    created_user = await database["users"].find_one({"_id": new_user.inserted_id})
    
    user_obj = User.from_mongo(created_user)
    
    # Create User node in Neo4j
    driver = neo4j_db.get_driver()
    if driver:
        query = "MERGE (u:User {id: $user_id})"
        try:
            async with driver.session() as session:
                await session.run(query, user_id=user_obj.id)
        except Exception as neo4j_err:
            print(f"[register] Neo4j unavailable: {neo4j_err}")
            
    return user_obj


@router.post("/login")
async def login(request: Request):
    database = db.get_db()
    content_type = request.headers.get("content-type", "")
    username = None
    password = None

    if "application/json" in content_type:
        try:
            body = await request.json()
            username = body.get("username") or body.get("email")
            password = body.get("password")
        except Exception:
            pass

    if not username or not password:
        try:
            form = await request.form()
            username = form.get("username") or form.get("email")
            password = form.get("password")
        except Exception:
            pass

    if not username or not password:
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    username = str(username).strip()
    password = str(password)

    # Case-insensitive email lookup
    user_data = await database["users"].find_one({
        "email": {"$regex": f"^{re.escape(username)}$", "$options": "i"}
    })
    if not user_data:
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    hashed_password = user_data.get("hashed_password")
    if not hashed_password or not verify_password(password, hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    access_token = create_access_token(subject=user_data.get("email", username))
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=User)
async def get_me(token: str = Depends(oauth2_scheme)):
    from app.api.deps import get_current_user
    return await get_current_user(token)
