from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from bson import ObjectId


class UserBase(BaseModel):
    email: EmailStr


class UserCreate(UserBase):
    password: str


class UserInDB(UserBase):
    hashed_password: str


class User(UserBase):
    id: Optional[str] = Field(default=None)

    @classmethod
    def from_mongo(cls, data: dict) -> "User":
        """Convert a MongoDB document (with _id) to a User model."""
        if data is None:
            return None
        data = dict(data)
        # Convert _id ObjectId to string
        oid = data.pop("_id", None)
        if oid is not None:
            data["id"] = str(oid)
        # Remove internal fields not part of the model
        data.pop("hashed_password", None)
        return cls(**data)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
