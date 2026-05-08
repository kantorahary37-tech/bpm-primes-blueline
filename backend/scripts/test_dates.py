import httpx
base = 'http://localhost:8000/api/v1'
r = httpx.post(base+'/auth/login', json={'email':'test3@test.com','password':'pass123'})
t = r.json()['access_token']
h = {'Authorization': 'Bearer '+t, 'Content-Type': 'application/json'}

print('=== Primes existantes (anciennes données) ===')
r = httpx.get(base+'/bonuses/', headers=h)
for b in r.json():
    print(f'  ID {b["id"]}: type={b["bonus_type"]}, start={b["start_date"]}, end={b["end_date"]}')

print('\n=== Création nouvelle prime juin 2026 ===')
payload = {'employee_id': 1, 'start_date': '2026-06-01', 'end_date': '2026-06-30', 'bonus_type': 'mensuel', 'total_amount': 200000}
r = httpx.post(base+'/bonuses/?user_id=6', json=payload, headers=h)
print(f'Status: {r.status_code}')
if r.status_code == 200:
    print(r.json())
else:
    print(r.text)

print('\n=== Test chevauchement (même période) ===')
r2 = httpx.post(base+'/bonuses/?user_id=6', json=payload, headers=h)
print(f'Status: {r2.status_code} {r2.text}')

print('\n=== Test période non-chevauchement ===')
payload2 = {'employee_id': 1, 'start_date': '2026-07-01', 'end_date': '2026-07-31', 'bonus_type': 'mensuel', 'total_amount': 150000}
r3 = httpx.post(base+'/bonuses/?user_id=6', json=payload2, headers=h)
print(f'Status: {r3.status_code}')
if r3.status_code == 200:
    print(r3.json())
else:
    print(r3.text)
