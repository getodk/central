from locust import HttpUser, task, between
import os

# Run with: locust -f locustfile.py --headless -u 100 -r 20 -t 30s
# Set CENTRAL_EMAIL and CENTRAL_PASSWORD for a real session payload.

EMAIL = os.environ.get("CENTRAL_EMAIL", "your@email.com")
PASSWORD = os.environ.get("CENTRAL_PASSWORD", "password@2026")


class CentralUser(HttpUser):
    host = "https://central.local"
    wait_time = between(0, 0)  # hammer continuously

    @task(3)
    def auth_hit(self):
        self.client.post("/v1/sessions",
                         json={"email": EMAIL, "password": PASSWORD},
                         verify=False)

    @task(1)
    def api_hit(self):
        self.client.get("/client-config.json", verify=False)
