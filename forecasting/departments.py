"""Demonstration department codes — mirrors SehatFlow configured OPD list."""

DEPARTMENTS: list[dict[str, str]] = [
    {"code": "general_medicine", "name": "General Medicine"},
    {"code": "pediatrics", "name": "Pediatrics"},
    {"code": "womens_health", "name": "Women's Health"},
    {"code": "orthopedics", "name": "Orthopedics"},
    {"code": "ent", "name": "ENT"},
    {"code": "ophthalmology", "name": "Ophthalmology"},
    {"code": "dermatology", "name": "Dermatology"},
]

DEPARTMENT_CODES = [d["code"] for d in DEPARTMENTS]
