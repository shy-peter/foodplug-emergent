from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
import uuid
import random
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "foodplug-dev-secret-change-me")
JWT_ALG = "HS256"
JWT_EXP_HOURS = 24 * 7

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="FoodPlug API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("foodplug")


# ---------- Helpers ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_token(payload: dict) -> str:
    data = {**payload, "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXP_HOURS)}
    return jwt.encode(data, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.users.find_one({"id": payload.get("uid")}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ---------- Models ----------
class LoginIn(BaseModel):
    email: str
    password: str


class UserPublic(BaseModel):
    id: str
    email: str
    role: Literal["admin", "sales"]
    display_name: str
    contact: Optional[str] = None


class LoginOut(BaseModel):
    token: str
    user: UserPublic


class AgentCreate(BaseModel):
    display_name: str
    email: str
    contact: Optional[str] = ""
    password: str


class CustomerCreate(BaseModel):
    name: str
    contractor: str
    pin: Optional[str] = None


class Customer(BaseModel):
    id: str
    name: str
    contractor: str
    pin: str
    created_at: str


class SaleCreate(BaseModel):
    type: Literal["customer", "visitor"]
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    contractor: Optional[str] = None
    food_type: Literal["soft", "hard", "visitor"]
    amount: float


class Sale(BaseModel):
    id: str
    type: str
    customer_id: Optional[str] = None
    customer_name: str
    contractor: str
    food_type: str
    amount: float
    agent_id: str
    agent_name: str
    created_at: str


# ---------- Seed ----------
async def seed_defaults():
    # Admin user
    admin_email = "admin@foodplug.com"
    if not await db.users.find_one({"email": admin_email}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hash_password("admin123"),
            "role": "admin",
            "display_name": "FoodPlug Admin",
            "contact": "",
            "created_at": now_iso(),
        })
        logger.info("Seeded default admin user")

    sales_email = "sales@foodplug.com"
    if not await db.users.find_one({"email": sales_email}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": sales_email,
            "password_hash": hash_password("sales123"),
            "role": "sales",
            "display_name": "Sales Team",
            "contact": "",
            "created_at": now_iso(),
        })
        logger.info("Seeded default sales user")

    # Seed a few customers
    if await db.customers.count_documents({}) == 0:
        samples = [
            {"name": "Amaka Okoro", "contractor": "Nile Constructions", "pin": "7341"},
            {"name": "Emeka Chukwu", "contractor": "Skyline Builders", "pin": "5082"},
            {"name": "Ngozi Umeh", "contractor": "Stonebridge Group", "pin": "6309"},
        ]
        for s in samples:
            await db.customers.insert_one({
                "id": str(uuid.uuid4()),
                **s,
                "created_at": now_iso(),
            })
        logger.info("Seeded sample customers")


@app.on_event("startup")
async def on_startup():
    await seed_defaults()


# ---------- Auth ----------
@api_router.post("/auth/login", response_model=LoginOut)
async def login(payload: LoginIn):
    user = await db.users.find_one({"email": payload.email.strip().lower()})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token({"uid": user["id"], "role": user["role"]})
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "role": user["role"],
            "display_name": user["display_name"],
            "contact": user.get("contact", ""),
        },
    }


@api_router.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return {
        "id": user["id"],
        "email": user["email"],
        "role": user["role"],
        "display_name": user["display_name"],
        "contact": user.get("contact", ""),
    }


# ---------- Agents (sales reps) ----------
@api_router.get("/agents")
async def list_agents(user: dict = Depends(require_admin)):
    agents = await db.users.find({"role": "sales"}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return agents


@api_router.post("/agents", response_model=UserPublic)
async def create_agent(payload: AgentCreate, user: dict = Depends(require_admin)):
    email = payload.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": hash_password(payload.password),
        "role": "sales",
        "display_name": payload.display_name.strip(),
        "contact": (payload.contact or "").strip(),
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    return {
        "id": doc["id"],
        "email": doc["email"],
        "role": "sales",
        "display_name": doc["display_name"],
        "contact": doc["contact"],
    }


@api_router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str, user: dict = Depends(require_admin)):
    res = await db.users.delete_one({"id": agent_id, "role": "sales"})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"ok": True}


# ---------- Customers ----------
async def _generate_unique_pin() -> str:
    for _ in range(20):
        pin = str(random.randint(1000, 9999))
        if not await db.customers.find_one({"pin": pin}):
            return pin
    raise HTTPException(status_code=500, detail="Could not generate unique PIN")


@api_router.get("/customers", response_model=List[Customer])
async def list_customers(user: dict = Depends(get_current_user)):
    docs = await db.customers.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return docs


@api_router.post("/customers", response_model=Customer)
async def create_customer(payload: CustomerCreate, user: dict = Depends(get_current_user)):
    pin = (payload.pin or "").strip() or await _generate_unique_pin()
    if await db.customers.find_one({"pin": pin}):
        raise HTTPException(status_code=400, detail="PIN already in use")
    doc = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "contractor": payload.contractor.strip(),
        "pin": pin,
        "created_at": now_iso(),
    }
    await db.customers.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(require_admin)):
    res = await db.customers.delete_one({"id": customer_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    return {"ok": True}


@api_router.get("/customers/{customer_id}/history")
async def customer_history(customer_id: str, user: dict = Depends(get_current_user)):
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    sales = await db.sales.find({"customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    total_meals = len(sales)
    total_cost = sum(s.get("amount", 0) for s in sales)
    return {"customer": customer, "sales": sales, "total_meals": total_meals, "total_cost": total_cost}


# ---------- Sales ----------
@api_router.post("/sales", response_model=Sale)
async def create_sale(payload: SaleCreate, user: dict = Depends(get_current_user)):
    if payload.amount < 100 or payload.amount > 20000:
        raise HTTPException(status_code=400, detail="Amount must be between ₦100 and ₦20,000")

    if payload.type == "customer":
        if not payload.customer_id:
            raise HTTPException(status_code=400, detail="customer_id required for customer sale")
        customer = await db.customers.find_one({"id": payload.customer_id}, {"_id": 0})
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        customer_name = customer["name"]
        contractor = customer["contractor"]
        customer_id = customer["id"]
    else:
        if not payload.customer_name or not payload.contractor:
            raise HTTPException(status_code=400, detail="Visitor name and contractor required")
        customer_name = payload.customer_name.strip()
        contractor = payload.contractor.strip()
        customer_id = None

    doc = {
        "id": str(uuid.uuid4()),
        "type": payload.type,
        "customer_id": customer_id,
        "customer_name": customer_name,
        "contractor": contractor,
        "food_type": payload.food_type,
        "amount": float(payload.amount),
        "agent_id": user["id"],
        "agent_name": user["display_name"],
        "created_at": now_iso(),
    }
    await db.sales.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api_router.get("/sales", response_model=List[Sale])
async def list_sales(
    start: Optional[str] = None,
    end: Optional[str] = None,
    customer_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    limit: int = 500,
    user: dict = Depends(get_current_user),
):
    query = {}
    if start or end:
        query["created_at"] = {}
        if start:
            query["created_at"]["$gte"] = start
        if end:
            query["created_at"]["$lte"] = end
    if customer_id:
        query["customer_id"] = customer_id
    if agent_id:
        query["agent_id"] = agent_id
    docs = await db.sales.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


# ---------- Stats ----------
def _period_bounds(period: str, month: Optional[str] = None):
    now = datetime.now(timezone.utc)
    if period == "day":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)
    elif period == "month":
        # month format YYYY-MM (optional). Default to current month.
        if month:
            try:
                y, m = month.split("-")
                start = datetime(int(y), int(m), 1, tzinfo=timezone.utc)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid month format, use YYYY-MM")
        else:
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # end = first day of next month
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
    elif period == "all":
        return None, None
    else:
        raise HTTPException(status_code=400, detail="Invalid period. Use day|month|all")
    return start.isoformat(), end.isoformat()


@api_router.get("/stats")
async def stats(period: str = "day", month: Optional[str] = None, user: dict = Depends(get_current_user)):
    start, end = _period_bounds(period, month)
    query = {}
    if start and end:
        query["created_at"] = {"$gte": start, "$lt": end}

    sales = await db.sales.find(query, {"_id": 0}).to_list(10000)
    total_revenue = sum(s.get("amount", 0) for s in sales)
    total_sales = len(sales)
    visitor_sales = [s for s in sales if s.get("type") == "visitor"]
    visitor_revenue = sum(s.get("amount", 0) for s in visitor_sales)
    customer_sales = [s for s in sales if s.get("type") == "customer"]
    customer_revenue = sum(s.get("amount", 0) for s in customer_sales)

    total_customers = await db.customers.count_documents({})
    total_agents = await db.users.count_documents({"role": "sales"})

    unique_customers = len({s.get("customer_id") for s in customer_sales if s.get("customer_id")})

    # Group by day for chart
    by_day: dict = {}
    for s in sales:
        d = (s.get("created_at") or "")[:10]
        if not d:
            continue
        by_day.setdefault(d, {"date": d, "revenue": 0, "count": 0})
        by_day[d]["revenue"] += s.get("amount", 0)
        by_day[d]["count"] += 1
    chart = sorted(by_day.values(), key=lambda x: x["date"])

    # Top customers
    by_customer: dict = {}
    for s in customer_sales:
        cid = s.get("customer_id")
        if not cid:
            continue
        by_customer.setdefault(cid, {
            "customer_id": cid,
            "customer_name": s.get("customer_name"),
            "contractor": s.get("contractor"),
            "meals": 0,
            "revenue": 0,
        })
        by_customer[cid]["meals"] += 1
        by_customer[cid]["revenue"] += s.get("amount", 0)
    top_customers = sorted(by_customer.values(), key=lambda x: x["revenue"], reverse=True)[:5]

    return {
        "period": period,
        "month": month,
        "range": {"start": start, "end": end},
        "total_revenue": total_revenue,
        "total_sales": total_sales,
        "customer_revenue": customer_revenue,
        "visitor_revenue": visitor_revenue,
        "visitor_sales_count": len(visitor_sales),
        "total_customers": total_customers,
        "total_agents": total_agents,
        "unique_customers_served": unique_customers,
        "chart": chart,
        "top_customers": top_customers,
    }


@api_router.get("/")
async def root():
    return {"service": "FoodPlug API", "status": "ok"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
