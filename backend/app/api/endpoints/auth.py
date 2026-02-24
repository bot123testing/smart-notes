from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from app.models.user import UserCreate, UserInDB, User
from app.core.security import get_password_hash, verify_password, create_access_token
from app.db.mongodb import db
from datetime import timedelta

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


@router.post("/register", response_model=User)
async def register(user: UserCreate):
    database = db.get_db()
    existing_user = await database["users"].find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_password = get_password_hash(user.password)
    user_in_db = UserInDB(email=user.email, hashed_password=hashed_password)

    new_user = await database["users"].insert_one(user_in_db.model_dump())
    created_user = await database["users"].find_one({"_id": new_user.inserted_id})
    return User.from_mongo(created_user)


@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    database = db.get_db()
    user_data = await database["users"].find_one({"email": form_data.username})
    if not user_data:
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    user = UserInDB(**user_data)
    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    access_token = create_access_token(subject=user.email)
    return {"access_token": access_token, "token_type": "bearer"}
