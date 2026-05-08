import urllib.request, json

base = 'http://localhost:8000/api/v1'

# Login
req = urllib.request.Request(
    base + '/auth/login',
    data=json.dumps({'email': 'test3@test.com', 'password': 'pass123'}).encode(),
    headers={'Content-Type': 'application/json'}
)
t = json.loads(urllib.request.urlopen(req).read())['access_token']
h = {'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json'}


def post(url, data):
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers=h)
    try:
        resp = urllib.request.urlopen(req)
        return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def get(url):
    req = urllib.request.Request(url, headers=h)
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())


# Test 1: Créer prime SANS user_id
print('=== Test 1: Création prime sans user_id ===')
status, data = post(base + '/bonuses/', {
    'employee_id': 4,
    'start_date': '2026-08-01',
    'end_date': '2026-08-31',
    'bonus_type': 'mensuel',
    'total_amount': 100000
})
print(f'  Status: {status}, ID créé: {data.get("id")}')
bonus_id = data.get('id')

# Test 2: Valider N+1 (statut Initialise -> En attente Directeur)
print('\n=== Test 2: Validation N+1 (bonus Initialise) ===')
status, data = post(base + f'/bonuses/{bonus_id}/validate?step=N1', {
    'action': 'VALIDER'
})
print(f'  Status: {status}, nouveau statut: {data.get("status")}')

# Test 3: Tenter DG directement (doit echouer)
print('\n=== Test 3: Tentative DG direct (sans passer par Directeur) ===')
status, data = post(base + f'/bonuses/{bonus_id}/validate?step=DG', {
    'action': 'VALIDER'
})
print(f'  Status: {status}, detail: {data.get("detail")}')

# Test 4: Valider Directeur (etape suivante)
print('\n=== Test 4: Validation Directeur ===')
status, data = post(base + f'/bonuses/{bonus_id}/validate?step=DIRECTEUR', {
    'action': 'VALIDER'
})
print(f'  Status: {status}, nouveau statut: {data.get("status")}')

# Test 5: Valider DG
print('\n=== Test 5: Validation DG (cloture auto) ===')
status, data = post(base + f'/bonuses/{bonus_id}/validate?step=DG', {
    'action': 'VALIDER'
})
print(f'  Status: {status}, nouveau statut: {data.get("status")}')

# Test 6: Re-valider (doit echouer)
print('\n=== Test 6: Re-validation impossible ===')
status, data = post(base + f'/bonuses/{bonus_id}/validate?step=N1', {
    'action': 'VALIDER'
})
print(f'  Status: {status}, detail: {data.get("detail")}')
