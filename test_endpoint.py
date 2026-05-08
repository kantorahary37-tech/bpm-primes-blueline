import requests
import json

url = "http://localhost:8000/api/v1/bonuses/?user_id=1"

payload = json.dumps({
  "employee_id": 1,
  "month": 5,
  "year": 2026,
  "bonus_type": "astreinte",
  "nb_jours_astreinte": 5,
  "taux_jour": 30000,
  "prime_astreinte_amount": 150000,
  "total_amount": 150000
})
headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2IiwiZXhwIjoxNzc4MzA0NTUyfQ.7Lr1rXsylxlcmh-HK1tmjJqH1xbDIbi4aNqHHP5B-SA'
}

response = requests.request("POST", url, headers=headers, data=payload)

print(response.text)
