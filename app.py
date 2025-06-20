import os
import json
from datetime import datetime, timedelta
from flask import Flask, jsonify, render_template, request, redirect, url_for, session
from flask_login import LoginManager, current_user, login_required, login_user, logout_user, UserMixin
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload # <-- ADDED
from google_auth_oauthlib.flow import Flow
import logging
import requests
import pytz
import io # <-- ADDED

# --- Basic Logging Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Configuration ---
DATABASE_SHEET_ID = '1ZufXPOUcoW2czQ0vcpZwvJNHngV4GHbbSl9q46UwF8g'
DATABASE_SHEET_NAME = 'DATABASE'
LOGS_SHEET_ID = '1ZufXPOUcoW2czQ0vcpZwvJNHngV4GHbbSl9q46UwF8g'
LOGS_SHEET_NAME = 'Web App Logs'
USERS_SHEET_NAME = 'Users'
# ================== NEW GOOGLE DRIVE CONFIG ==================
DRIVE_FOLDER_ID = '1qwCPheAuWIRG8PHK9j8PRz3vNNpJ3KHM' # <-- PASTE YOUR FOLDER ID HERE
# =============================================================
ADMIN_USER_EMAILS = ['harrypobreza@gmail.com'] 
ALL_PERMISSIONS = {
    'MULTI_SELECT',
    'SEARCH_ALL',
    'EDIT_TABLE',
    'VIEW_COMMISSION'
}
YOUR_TIMEZONE = 'Asia/Manila'

# --- Flask App Initialization ---
app = Flask(__name__)
app.secret_key = os.urandom(24)

# --- Updated User and Login Management ---
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "login"

class User(UserMixin):
    def __init__(self, id, name, email, is_admin=False, permissions=None):
        self.id = id
        self.name = name
        self.email = email
        self.is_admin = is_admin
        self.permissions = ALL_PERMISSIONS if is_admin else (permissions or set())

users = {} 
@login_manager.user_loader
def load_user(user_id):
    return users.get(user_id)

# --- Google API Setup ---
CLIENT_SECRET_FILE = 'client_secret.json'
SCOPES_OAUTH = ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email', 'openid']
SCOPES_SERVICE_ACCOUNT = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive' # <-- ADDED
]
creds_service_account = None
try:
    if 'GOOGLE_CREDENTIALS_JSON' in os.environ:
        creds_json = json.loads(os.environ.get('GOOGLE_CREDENTIALS_JSON'))
        creds_service_account = service_account.Credentials.from_service_account_info(creds_json, scopes=SCOPES_SERVICE_ACCOUNT)
    else:
        KEY_FILE_LOCATION = os.path.join(os.path.dirname(__file__), 'credentials.json')
        creds_service_account = service_account.Credentials.from_service_account_file(KEY_FILE_LOCATION, scopes=SCOPES_SERVICE_ACCOUNT)
    service = build('sheets', 'v4', credentials=creds_service_account)
    sheet_api = service.spreadsheets()
    logging.info("Successfully connected to Google Sheets API.")
except Exception as e:
    logging.error(f"FATAL ERROR: Could not load Google Sheets credentials. {e}")
    sheet_api = None

# --- Helper Functions ---
# ... (All helper functions are unchanged) ...
def to_float(value):
    if isinstance(value, (int, float)): return float(value)
    if not isinstance(value, str): return 0.0
    cleaned_value = value.strip().replace('₱', '').replace(',', '')
    if not cleaned_value: return 0.0
    try: return float(cleaned_value)
    except (ValueError, TypeError): return 0.0

def get_sheet_data(sheet_id, sheet_name_range):
    if not sheet_api: return None
    try:
        result = sheet_api.values().get(spreadsheetId=sheet_id, range=sheet_name_range).execute()
        return result.get('values', [])
    except Exception as e:
        logging.error(f"Error fetching sheet data for range '{sheet_name_range}': {e}")
        return None
        
def calculate_date_range(month_name, week_str):
    try:
        month_map = { "January": 1, "February": 2, "March": 3, "April": 4, "May": 5, "June": 6, "July": 7, "August": 8, "September": 9, "October": 10, "November": 11, "December": 12 }
        target_month_index = month_map.get(month_name)
        week_num = int(week_str.replace('Week ', ''))
        if not target_month_index or week_num < 1: return ""
        year = datetime.now().year
        first_day_of_month = datetime(year, target_month_index, 1)
        days_to_subtract_for_monday = first_day_of_month.weekday()
        week1_start_date = first_day_of_month - timedelta(days=days_to_subtract_for_monday)
        selected_week_start_date = week1_start_date + timedelta(weeks=week_num - 1)
        selected_week_end_date = selected_week_start_date + timedelta(days=6)
        start_month_name, end_month_name = selected_week_start_date.strftime("%B").upper(), selected_week_end_date.strftime("%B").upper()
        if start_month_name == end_month_name:
            return f"{start_month_name} {selected_week_start_date.day} - {selected_week_end_date.day}"
        else:
            return f"{start_month_name} {selected_week_start_date.day} - {end_month_name} {selected_week_end_date.day}"
    except Exception as e:
        logging.error(f"Error in calculate_date_range: {e}")
        return ""

# --- Core Routes ---
# ... (All core routes are unchanged) ...
@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route('/login')
def login():
    return """
        <!DOCTYPE html><html><head><title>Login</title><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; background-color: #121212; color: #e0e0e0; margin: 0; } h1 { font-weight: 500; margin-bottom: 2rem; } a { display: inline-flex; align-items: center; gap: 12px; background-color: #FFFFFF; color: #1f2937; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); transition: transform 0.2s; } a:hover { transform: translateY(-2px); } img { width: 24px; height: 24px; }</style></head><body><h1>Dashboard Login</h1><a href="/authorize"><img src="https://developers.google.com/identity/images/g-logo.png" alt="Google logo">Sign In with Google</a></body></html>
    """

@app.route("/authorize")
def authorize():
    if not os.path.exists(CLIENT_SECRET_FILE): return "Error: client_secret.json not found.", 500
    flow = Flow.from_client_secrets_file(CLIENT_SECRET_FILE, scopes=SCOPES_OAUTH, redirect_uri=url_for('callback', _external=True))
    authorization_url, state = flow.authorization_url()
    session["state"] = state
    return redirect(authorization_url)

@app.route("/callback")
def callback():
    flow = Flow.from_client_secrets_file(CLIENT_SECRET_FILE, scopes=SCOPES_OAUTH, state=session["state"], redirect_uri=url_for('callback', _external=True))
    flow.fetch_token(authorization_response=request.url)
    credentials = flow.credentials
    user_info_response = requests.get('https://www.googleapis.com/oauth2/v3/userinfo', headers={'Authorization': f'Bearer {credentials.token}'})
    user_info = user_info_response.json()

    user_id = user_info.get('sub')
    user_email = user_info.get('email', '').lower()
    user_name = user_info.get('name')

    user_data = get_sheet_data(DATABASE_SHEET_ID, f"{USERS_SHEET_NAME}!A:E") or []
    user_map = {row[1].lower(): row for row in user_data[1:] if len(row) > 1}

    is_admin = user_email in [email.lower() for email in ADMIN_USER_EMAILS]
    
    permissions = set()

    if user_email in user_map:
        sheet_row = user_map[user_email]
        if len(sheet_row) > 4 and sheet_row[4]:
            permissions = set(p.strip() for p in sheet_row[4].split(','))
    else:
        new_row = [user_id, user_email, user_name, str(is_admin).upper(), ""]
        sheet_api.values().append(
            spreadsheetId=DATABASE_SHEET_ID,
            range=f"{USERS_SHEET_NAME}!A1",
            valueInputOption='USER_ENTERED',
            body={'values': [new_row]}
        ).execute()

    user = User(id=user_id, name=user_name, email=user_email, is_admin=is_admin, permissions=permissions)

    users[user_id] = user
    login_user(user)
    return redirect(url_for('index'))

@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

# --- API Routes ---
@app.route('/api/user-info', methods=['GET'])
@login_required
def get_user_info():
    return jsonify({
        "email": current_user.email,
        "name": current_user.name,
        "isAdmin": current_user.is_admin,
        "permissions": list(current_user.permissions)
    })

@app.route('/api/users', methods=['GET'])
@login_required
def get_all_users():
    if not current_user.is_admin:
        return jsonify({"error": "Forbidden"}), 403
    
    user_data = get_sheet_data(DATABASE_SHEET_ID, f"{USERS_SHEET_NAME}!B:E")
    if not user_data or len(user_data) < 2:
        return jsonify({"users": [], "all_permissions": list(ALL_PERMISSIONS)})
    
    users_list = []
    for row in user_data[1:]:
        if len(row) > 0:
             is_admin_flag = row[2].upper() == 'TRUE' if len(row) > 2 else False
             permissions_str = row[3] if len(row) > 3 else ""
             users_list.append({
                "email": row[0],
                "name": row[1] if len(row) > 1 else "N/A",
                "is_admin": is_admin_flag,
                "permissions": [p.strip() for p in permissions_str.split(',') if p]
            })
    return jsonify({"users": users_list, "all_permissions": list(ALL_PERMISSIONS)})

@app.route('/api/update_user_permission', methods=['POST'])
@login_required
def update_user_permission():
    if not current_user.is_admin:
        return jsonify({"success": False, "error": "Forbidden"}), 403

    data = request.get_json()
    target_email = data.get('email', '').lower()
    new_permissions = data.get('permissions', [])

    if not target_email:
        return jsonify({"success": False, "error": "No email provided"}), 400
    
    user_data = get_sheet_data(DATABASE_SHEET_ID, f"{USERS_SHEET_NAME}!A:E")
    if not user_data:
        return jsonify({"success": False, "error": "Could not read Users sheet"}), 500
    
    row_index_to_update = -1
    is_target_root_admin = False
    for i, row in enumerate(user_data):
        if len(row) > 1 and row[1].lower() == target_email:
            row_index_to_update = i + 1
            if row[1].lower() in [email.lower() for email in ADMIN_USER_EMAILS]:
                is_target_root_admin = True
            break
    
    if row_index_to_update == -1: return jsonify({"success": False, "error": "User not found"}), 404
    if is_target_root_admin: return jsonify({"success": False, "error": "Cannot change permissions for a root admin"}), 400

    permissions_string = ",".join(sorted(new_permissions))
    
    range_to_update = f"{USERS_SHEET_NAME}!E{row_index_to_update}"
    sheet_api.values().update(
        spreadsheetId=DATABASE_SHEET_ID,
        range=range_to_update,
        valueInputOption='RAW',
        body={'values': [[permissions_string]]}
    ).execute()

    return jsonify({"success": True, "message": f"Permissions for {target_email} updated."})

@app.route('/api/ba-names', methods=['GET'])
@login_required
def get_unique_ba_names():
    data = get_sheet_data(DATABASE_SHEET_ID, f"{DATABASE_SHEET_NAME}!D:D") # More efficient
    if not data or len(data) <= 1: return jsonify([])
    ba_names = set(row[0].strip() for row in data[1:] if row and row[0])
    return jsonify(sorted(list(ba_names)))

@app.route('/api/search', methods=['POST'])
@login_required
def search_dashboard_data():
    # This entire function is correct and unchanged
    pass 

@app.route('/api/save_dashboard', methods=['POST'])
@login_required
def save_dashboard():
    # This entire function is correct and unchanged
    pass

# ================== NEW API ENDPOINT FOR FILE UPLOAD ==================
@app.route('/api/upload_payout_info', methods=['POST'])
@login_required
def upload_payout_info():
    if 'mopAccountName' not in request.form or 'mopNumber' not in request.form:
        return jsonify({"success": False, "error": "Missing account name or number."}), 400
    if 'payoutImage' not in request.files:
        return jsonify({"success": False, "error": "No image file was uploaded."}), 400

    image_file = request.files['payoutImage']

    if image_file.filename == '':
        return jsonify({"success": False, "error": "No selected file."}), 400

    try:
        drive_service = build('drive', 'v3', credentials=creds_service_account)
        
        # We use the user's name from their logged-in session for the filename
        user_name = current_user.name
        filename = f"{user_name}.jpeg"

        file_metadata = {
            'name': filename,
            'parents': [DRIVE_FOLDER_ID]
        }
        
        media = MediaIoBaseUpload(io.BytesIO(image_file.read()),
                                  mimetype='image/jpeg',
                                  resumable=True)
        
        file = drive_service.files().create(body=file_metadata,
                                            media_body=media,
                                            fields='id').execute()
        
        logging.info(f"User {current_user.email} uploaded file '{filename}' with ID: {file.get('id')}")

        return jsonify({"success": True, "message": "Payout information and image uploaded successfully!"})

    except Exception as e:
        logging.error(f"Error during file upload for user {current_user.email}: {e}")
        return jsonify({"success": False, "error": f"An unexpected error occurred during upload: {e}"}), 500

# Logging Function
SHEET_ID_CACHE = {}
def _get_sheet_id_by_name(spreadsheet_id, sheet_name):
    """Gets the numeric ID of a sheet by its name, using a cache."""
    if spreadsheet_id in SHEET_ID_CACHE and sheet_name in SHEET_ID_CACHE[spreadsheet_id]:
        return SHEET_ID_CACHE[spreadsheet_id][sheet_name]

    try:
        spreadsheet_metadata = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
        for sheet in spreadsheet_metadata.get('sheets', []):
            props = sheet.get('properties', {})
            if props.get('title') == sheet_name:
                sheet_id = props.get('sheetId')
                if spreadsheet_id not in SHEET_ID_CACHE:
                    SHEET_ID_CACHE[spreadsheet_id] = {}
                SHEET_ID_CACHE[spreadsheet_id][sheet_name] = sheet_id
                return sheet_id
        return None
    except Exception as e:
        logging.error(f"Could not get sheet ID for '{sheet_name}': {e}")
        return None

def log_user_event(function_name, inputs):
    if not sheet_api: return
    try:
        logs_sheet_id = _get_sheet_id_by_name(LOGS_SHEET_ID, LOGS_SHEET_NAME)
        if logs_sheet_id is None:
            logging.error(f"Could not find sheet named '{LOGS_SHEET_NAME}' to log event.")
            return

        utc_now = datetime.now(pytz.utc)
        local_tz = pytz.timezone(YOUR_TIMEZONE)
        local_now = utc_now.astimezone(local_tz)
        timestamp = local_now.strftime('%A, %B %d, %Y, %I:%M:%S %p')
        user_email = current_user.email if current_user.is_authenticated else "Anonymous"
        
        if function_name == 'saveDashboardData':
            formatted_inputs = f"Updated data for {len(inputs.get('updated_palcodes', []))} palcodes."
        else:
            ba_names_str = ', '.join(inputs.get('baNames', [])) if inputs.get('baNames') else "N/A"
            formatted_inputs = f"Month - {inputs.get('month', 'N/A')}, Week - {inputs.get('week', 'N/A').replace('week ', '')}, Ba Name(s) - {ba_names_str}, Palcode - {inputs.get('palcode', 'N/A') or 'N/A'}"
        
        new_row_data = [timestamp, user_email, function_name, formatted_inputs]

        requests_body = [
            {
                "insertDimension": {
                    "range": {
                        "sheetId": logs_sheet_id,
                        "dimension": "ROWS",
                        "startIndex": 1,
                        "endIndex": 2
                    }
                }
            },
            {
                "updateCells": {
                    "rows": [
                        {
                            "values": [
                                {"userEnteredValue": {"stringValue": str(cell)}} for cell in new_row_data
                            ]
                        }
                    ],
                    "fields": "userEnteredValue",
                    "start": {
                        "sheetId": logs_sheet_id,
                        "rowIndex": 1,
                        "columnIndex": 0
                    }
                }
            }
        ]

        sheet_api.batchUpdate(
            spreadsheetId=LOGS_SHEET_ID,
            body={'requests': requests_body}
        ).execute()

    except Exception as e:
        logging.error(f"Error logging event by inserting row: {e}")

if __name__ == '__main__':
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
    app.run(host='0.0.0.0', port=5001, debug=True)