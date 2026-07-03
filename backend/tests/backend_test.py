"""
FoodPlug backend API tests.
Covers: auth, agents, customers, sales, stats.
Uses REACT_APP_BACKEND_URL for real end-to-end HTTP testing.
"""
import os
import uuid
import time
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

# Load frontend .env to grab public backend URL used by browsers
FRONTEND_ENV = Path(__file__).resolve().parents[2] / "frontend" / ".env"
load_dotenv(FRONTEND_ENV)

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set for tests"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@foodplug.com"
ADMIN_PASSWORD = "admin123"
SALES_EMAIL = "sales@foodplug.com"
SALES_PASSWORD = "sales123"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="session")
def sales_token():
    r = requests.post(f"{API}/auth/login", json={"email": SALES_EMAIL, "password": SALES_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Sales login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Auth ----------
class TestAuth:
    def test_login_success(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and isinstance(data["token"], str)
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"

    def test_login_invalid_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_login_case_insensitive_email(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL.upper(), "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200

    def test_me_requires_token(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_with_token(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=auth(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL


# ---------- Agents ----------
class TestAgents:
    created_agent_id = None
    agent_email = f"TEST_agent_{uuid.uuid4().hex[:8]}@foodplug.com"
    agent_password = "testpass123"

    def test_list_agents_admin(self, admin_token):
        r = requests.get(f"{API}/agents", headers=auth(admin_token), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_agents_non_admin_rejected(self, sales_token):
        r = requests.get(f"{API}/agents", headers=auth(sales_token), timeout=15)
        assert r.status_code == 403

    def test_create_agent(self, admin_token):
        payload = {
            "display_name": "TEST Agent",
            "email": TestAgents.agent_email,
            "contact": "+234 800 000 0000",
            "password": TestAgents.agent_password,
        }
        r = requests.post(f"{API}/agents", json=payload, headers=auth(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["role"] == "sales"
        assert data["email"] == payload["email"].lower()
        assert data["display_name"] == payload["display_name"]
        TestAgents.created_agent_id = data["id"]

    def test_created_agent_can_login(self):
        r = requests.post(
            f"{API}/auth/login",
            json={"email": TestAgents.agent_email, "password": TestAgents.agent_password},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "sales"

    def test_create_agent_duplicate_email(self, admin_token):
        payload = {
            "display_name": "Dup",
            "email": TestAgents.agent_email,
            "password": "another",
        }
        r = requests.post(f"{API}/agents", json=payload, headers=auth(admin_token), timeout=15)
        assert r.status_code == 400

    def test_delete_agent(self, admin_token):
        assert TestAgents.created_agent_id
        r = requests.delete(f"{API}/agents/{TestAgents.created_agent_id}", headers=auth(admin_token), timeout=15)
        assert r.status_code == 200
        # verify gone
        r2 = requests.delete(f"{API}/agents/{TestAgents.created_agent_id}", headers=auth(admin_token), timeout=15)
        assert r2.status_code == 404


# ---------- Customers ----------
class TestCustomers:
    created_id = None

    def test_list_customers(self, admin_token):
        r = requests.get(f"{API}/customers", headers=auth(admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # seeded 3 customers
        assert len(data) >= 3

    def test_create_customer_auto_pin(self, admin_token):
        payload = {"name": "TEST_Chuka Iwe", "contractor": "TEST_Zenith Build"}
        r = requests.post(f"{API}/customers", json=payload, headers=auth(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == payload["name"]
        assert data["contractor"] == payload["contractor"]
        assert len(data["pin"]) == 4 and data["pin"].isdigit()
        TestCustomers.created_id = data["id"]

    def test_verify_customer_persisted(self, admin_token):
        r = requests.get(f"{API}/customers", headers=auth(admin_token), timeout=15)
        ids = [c["id"] for c in r.json()]
        assert TestCustomers.created_id in ids

    def test_customer_history_empty(self, admin_token):
        r = requests.get(f"{API}/customers/{TestCustomers.created_id}/history", headers=auth(admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["total_meals"] == 0
        assert data["total_cost"] == 0

    def test_delete_customer_admin_only(self, sales_token):
        r = requests.delete(f"{API}/customers/{TestCustomers.created_id}", headers=auth(sales_token), timeout=15)
        assert r.status_code == 403

    def test_delete_customer_success(self, admin_token):
        r = requests.delete(f"{API}/customers/{TestCustomers.created_id}", headers=auth(admin_token), timeout=15)
        assert r.status_code == 200
        r2 = requests.delete(f"{API}/customers/{TestCustomers.created_id}", headers=auth(admin_token), timeout=15)
        assert r2.status_code == 404


# ---------- Sales ----------
class TestSales:
    sale_id = None
    customer_id = None

    def test_create_customer_sale(self, admin_token, sales_token):
        # pick first seeded customer
        customers = requests.get(f"{API}/customers", headers=auth(admin_token), timeout=15).json()
        assert customers
        cust = customers[0]
        TestSales.customer_id = cust["id"]
        payload = {
            "type": "customer",
            "customer_id": cust["id"],
            "food_type": "soft",
            "amount": 500,
        }
        r = requests.post(f"{API}/sales", json=payload, headers=auth(sales_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["amount"] == 500
        assert data["customer_id"] == cust["id"]
        assert data["food_type"] == "soft"
        assert data["type"] == "customer"
        TestSales.sale_id = data["id"]

    def test_sale_amount_out_of_range(self, sales_token):
        payload = {
            "type": "customer",
            "customer_id": TestSales.customer_id,
            "food_type": "soft",
            "amount": 50,
        }
        r = requests.post(f"{API}/sales", json=payload, headers=auth(sales_token), timeout=15)
        assert r.status_code == 400

        payload["amount"] = 30000
        r = requests.post(f"{API}/sales", json=payload, headers=auth(sales_token), timeout=15)
        assert r.status_code == 400

    def test_visitor_sale(self, sales_token):
        payload = {
            "type": "visitor",
            "customer_name": "TEST_Visitor One",
            "contractor": "TEST_Passerby Co",
            "food_type": "visitor",
            "amount": 1500,
        }
        r = requests.post(f"{API}/sales", json=payload, headers=auth(sales_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["type"] == "visitor"

    def test_visitor_sale_missing_fields(self, sales_token):
        payload = {"type": "visitor", "food_type": "visitor", "amount": 500}
        r = requests.post(f"{API}/sales", json=payload, headers=auth(sales_token), timeout=15)
        assert r.status_code == 400

    def test_list_sales(self, admin_token):
        r = requests.get(f"{API}/sales", headers=auth(admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 2

    def test_customer_history_after_sale(self, admin_token):
        r = requests.get(f"{API}/customers/{TestSales.customer_id}/history", headers=auth(admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["total_meals"] >= 1
        assert data["total_cost"] >= 500


# ---------- Stats ----------
class TestStats:
    def test_stats_day(self, admin_token):
        r = requests.get(f"{API}/stats", params={"period": "day"}, headers=auth(admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        for k in ("total_revenue", "total_sales", "visitor_revenue", "total_customers", "total_agents", "chart", "top_customers"):
            assert k in data

    def test_stats_month(self, admin_token):
        r = requests.get(f"{API}/stats", params={"period": "month"}, headers=auth(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["period"] == "month"

    def test_stats_all(self, admin_token):
        r = requests.get(f"{API}/stats", params={"period": "all"}, headers=auth(admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["total_sales"] >= 2

    def test_stats_bad_period(self, admin_token):
        r = requests.get(f"{API}/stats", params={"period": "week"}, headers=auth(admin_token), timeout=15)
        assert r.status_code == 400

    def test_stats_bad_month(self, admin_token):
        r = requests.get(
            f"{API}/stats", params={"period": "month", "month": "not-a-month"}, headers=auth(admin_token), timeout=15
        )
        assert r.status_code == 400

    def test_stats_requires_auth(self):
        r = requests.get(f"{API}/stats", timeout=15)
        assert r.status_code == 401
