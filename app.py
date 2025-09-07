import os
import json
from datetime import datetime, timedelta
from flask import Flask, jsonify, render_template, request, redirect, url_for, session, send_from_directory, Response
from flask_login import LoginManager, current_user, login_required, login_user, logout_user, UserMixin
from google.oauth2 import service_account
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import Flow
import logging
import requests
import pytz
import uuid
from werkzeug.utils import secure_filename
import queue
import threading

# --- Basic Logging Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Configuration ---
DATABASE_SHEET_ID = '1ZufXPOUcoW2czQ0vcpZwvJNHngV4GHbbSl9q46UwF8g'
DATABASE_SHEET_NAME = 'DATABASE'
LOGS_SHEET_ID = '1ZufXPOUcoW2czQ0vcpZwvJNHngV4GHbbSl9q46UwF8g'
LOGS_SHEET_NAME = 'Web App Logs'
USERS_SHEET_NAME = 'Users'
ADMIN_USER_EMAILS = ['harrypobreza@gmail.com'] 
ALL_PERMISSIONS = {
    'MULTI_SELECT',
    'SEARCH_ALL',
    'EDIT_TABLE',
    'VIEW_COMMISSION',
    'VIEW_PAYOUTS'  # <-- Add this line
}
YOUR_TIMEZONE = 'Asia/Manila'
PAYOUT_UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'payout_uploads')
REDATABASE_SHEET_NAME = 'REDATABASE'  # <-- Add this line

# --- Flask App Initialization ---
app = Flask(__name__)
app.secret_key = os.urandom(24)
os.makedirs(PAYOUT_UPLOAD_FOLDER, exist_ok=True)

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
SCOPES_SERVICE_ACCOUNT = ['https://www.googleapis.com/auth/spreadsheets']
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


# --- Local File Upload ---
def upload_file_locally(file_stream, filename):
    file_path = os.path.join(PAYOUT_UPLOAD_FOLDER, filename)
    file_stream.seek(0)
    with open(file_path, 'wb') as f:
        f.write(file_stream.read())
    return filename

# --- Helper Functions ---
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
        if not target_month_index or week_num < 1:
            return ""
        year = datetime.now().year
        first_day_of_month = datetime(year, target_month_index, 1)
        days_to_subtract_for_monday = first_day_of_month.weekday()
        week1_start_date = first_day_of_month - timedelta(days=days_to_subtract_for_monday)
        selected_week_start_date = week1_start_date + timedelta(weeks=week_num - 1)
        selected_week_end_date = selected_week_start_date + timedelta(days=6)
        start_month_name = selected_week_start_date.strftime('%B')
        end_month_name = selected_week_end_date.strftime('%B')
        if start_month_name == end_month_name:
            return f"{selected_week_start_date.strftime('%b %d')} - {selected_week_end_date.strftime('%d')}"
        else:
            return f"{selected_week_start_date.strftime('%b %d')} - {selected_week_end_date.strftime('%b %d')}"
    except Exception as e:
        logging.error(f"Error in calculate_date_range: {e}")
        return ""

# --- Core Routes ---
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
    if not os.path.exists(CLIENT_SECRET_FILE):
        return "Google client secret file missing.", 500
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
        row = user_map[user_email]
        if len(row) > 4 and row[4]:
            permissions = set(row[4].split(","))
    user = User(id=user_id, name=user_name, email=user_email, is_admin=is_admin, permissions=permissions)
    users[user_id] = user
    login_user(user)

    # --- Only allow users that admin has allowed (whitelist) ---
    global ALLOWED_USER_EMAILS
    user_data = get_sheet_data(DATABASE_SHEET_ID, f"{USERS_SHEET_NAME}!A:E")
    if not user_data or len(user_data) < 2:
        ALLOWED_USER_EMAILS = set()
    else:
        # Assume column 1 (EMAIL) and column 0 (ID) are present, and column 3 (ALLOWED) is "YES" or blank
        allowed = set()
        for row in user_data[1:]:
            if len(row) > 3 and row[3].strip().upper() == "YES":
                allowed.add(row[1].strip().lower())
        ALLOWED_USER_EMAILS = allowed

    if user_email not in ALLOWED_USER_EMAILS and user_email not in [email.lower() for email in ADMIN_USER_EMAILS]:
        return "Access denied. You are not allowed to use this web app. Please contact the administrator.", 403

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
        return jsonify({'error': 'Forbidden'}), 403
    user_data = get_sheet_data(DATABASE_SHEET_ID, f"{USERS_SHEET_NAME}!A:E")
    if not user_data or len(user_data) < 2:
        return jsonify({'users': [], 'all_permissions': list(ALL_PERMISSIONS)})
    users_list = []
    for row in user_data[1:]:
        if len(row) >= 3:
            users_list.append({
                'name': row[2],  # NAME is column 2
                'email': row[1], # EMAIL is column 1
                'permissions': row[4].split(",") if len(row) > 4 and row[4] else []
            })
    return jsonify({"users": users_list, "all_permissions": list(ALL_PERMISSIONS)})

@app.route('/api/update_user_permission', methods=['POST'])
@login_required
def update_user_permission():
    if not current_user.is_admin:
        return jsonify({'error': 'Forbidden'}), 403
    data = request.get_json()
    target_email = data.get('email', '').lower()
    new_permissions = data.get('permissions', [])
    if not target_email:
        return jsonify({'error': 'Missing email'}), 400
    user_data = get_sheet_data(DATABASE_SHEET_ID, f"{USERS_SHEET_NAME}!A:E")
    if not user_data:
        return jsonify({'error': 'User data not found'}), 404
    row_index_to_update = -1
    is_target_root_admin = False
    for i, row in enumerate(user_data):
        if len(row) > 1 and row[1].lower() == target_email:
            row_index_to_update = i + 1
            if row[1].lower() in [email.lower() for email in ADMIN_USER_EMAILS]:
                is_target_root_admin = True
            break
    if row_index_to_update == -1:
        return jsonify({'error': 'User not found'}), 404
    if is_target_root_admin:
        return jsonify({'error': 'Cannot change root admin permissions'}), 403
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
    data = get_sheet_data(DATABASE_SHEET_ID, f"{DATABASE_SHEET_NAME}!A:L")
    if not data or len(data) <= 1:
        return jsonify([])
    ba_names = set(row[3].strip() for row in data[1:] if len(row) > 3 and row[3])
    return jsonify(sorted(list(ba_names)))

@app.route('/api/search', methods=['POST'])
@login_required
def search_dashboard_data():
    req_data = request.get_json()
    month = req_data.get('month')
    week = req_data.get('week')
    ba_names = req_data.get('baNames', [])
    palcode = req_data.get('palcode', '')
    if not month or not week:
        return jsonify({'error': 'Month and week required'}), 400
    if not ba_names and 'SEARCH_ALL' not in current_user.permissions:
        return jsonify({'error': 'BA name required'}), 400
    all_sheet_data = get_sheet_data(DATABASE_SHEET_ID, f"{DATABASE_SHEET_NAME}!A:L")
    if all_sheet_data is None:
        return jsonify({'error': 'Database unavailable'}), 500
    log_user_event('searchDashboardData', req_data)
    search_month, search_week = month.strip().lower(), week.strip().lower()
    search_ba_names_lower = [str(name).strip().lower() for name in ba_names if name]
    search_palcode_lower = palcode.strip().lower() if palcode else ""
    PALCODE, MONTH, WEEK, BA_NAME, REG, VALID_FD, SUSPENDED_FD, RATE, GGR_PER_FD, TOTAL_GGR, SALARY, STATUS = 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
    period_data_rows = [row for row in all_sheet_data[1:] if len(row) > WEEK and row[MONTH].strip().lower() == search_month and row[WEEK].strip().lower() == search_week]
    ba_display_name = "ALL BAs" if 'SEARCH_ALL' in current_user.permissions and not search_ba_names_lower else (f"MULTIPLE BAs ({len(search_ba_names_lower)})" if len(search_ba_names_lower) > 1 else (ba_names[0].strip().upper() if search_ba_names_lower else "N/A"))
    search_criteria_frontend = {'baNames': [name.strip().upper() for name in ba_names]}
    date_range_display = calculate_date_range(month, week)
    utc_now = datetime.now(pytz.utc)
    local_tz = pytz.timezone(YOUR_TIMEZONE)
    local_now = utc_now.astimezone(local_tz)
    last_update_timestamp = local_now.strftime('%A, %B %d, %Y, %I:%M:%S %p')
    if not period_data_rows:
        return jsonify({ "baNameDisplay": ba_display_name, "searchCriteria": search_criteria_frontend, "summary": {"totalRegistration": 0, "totalValidFd": 0, "totalSuspended": 0, "totalSalary": 0, "totalIncentives": 0, "totalCommission": 0}, "monthDisplay": search_month.upper(), "weekDisplay": search_week.upper(), "dateRangeDisplay": date_range_display, "status": "N/A", "resultsTable": [], "rankedBaList": [], "lastUpdate": last_update_timestamp, "message": "No records for selected period." })
    overall_total_valid_fd, ba_period_fds = 0, {}
    for row in period_data_rows:
        try:
            current_fd, ba_name = to_float(row[VALID_FD]) if len(row) > VALID_FD else 0, row[BA_NAME].strip() if len(row) > BA_NAME and row[BA_NAME] else "Unknown BA"
            overall_total_valid_fd += current_fd
            if ba_name not in ba_period_fds: ba_period_fds[ba_name] = {"originalName": ba_name, "totalFd": 0}
            ba_period_fds[ba_name]["totalFd"] += current_fd
        except (ValueError, IndexError): continue
    final_ranked_ba_list = sorted(ba_period_fds.values(), key=lambda x: x['totalFd'], reverse=True)
    ba_incentives_map, sum_of_all_individual_incentives = {}, 0
    # --- Only count FDs 100 and above for incentive eligibility ---
    if overall_total_valid_fd >= 9000:
        # --- New milestone for 20k+ total valid FD ---
        milestone_20k = overall_total_valid_fd >= 20000
        for i, ba in enumerate(final_ranked_ba_list):
            rank = i + 1
            eligible_fd = ba['totalFd'] if ba['totalFd'] >= 100 else 0
            incentive = 0
            if eligible_fd > 0:
                if milestone_20k:
                    # Apply new milestone incentives for 20k+
                    if rank == 1:
                        incentive = 5000
                    elif rank == 2:
                        incentive = 2500
                    elif rank == 3:
                        incentive = 1500
                    elif 4 <= rank <= 6:
                        incentive = 900
                    elif 7 <= rank <= 10:
                        incentive = 500
                    elif rank > 10 and ba['totalFd'] >= 300:
                        incentive = 400
                    elif rank > 10:
                        incentive = 200
                else:
                    # Existing incentive logic
                    if rank == 1:
                        if ba['totalFd'] >= 3000:
                            incentive = 4000
                        else:
                            incentive = 3000
                    elif rank == 2:
                        incentive = 1500
                    elif rank == 3:
                        incentive = 900
                    elif 4 <= rank <= 6:
                        incentive = 500
                    elif rank > 6:
                        incentive = 200
            if incentive > 0:
                ba_incentives_map[ba['originalName'].upper()] = incentive
                sum_of_all_individual_incentives += incentive
    filtered_rows = [row for row in period_data_rows if ((not search_ba_names_lower or (len(row) > BA_NAME and row[BA_NAME].strip().lower() in search_ba_names_lower)) and (not search_palcode_lower or (len(row) > PALCODE and row[PALCODE].strip().lower() == search_palcode_lower)))]
    results_for_table = filtered_rows
    commission_map = { 25.00: 5, 60.00: 10, 80.00: 10, 90.00: 10, 140.00: 10, 230.00: 20, 325.00: 25, 420.00: 30 }
    summary_for_display = {"totalRegistration": 0, "totalValidFd": 0, "totalSuspended": 0, "totalSalary": 0, "totalIncentives": 0, "totalCommission": 0}
    for row in filtered_rows:
        try:
            summary_for_display['totalRegistration'] += to_float(row[REG]) if len(row) > REG else 0
            summary_for_display['totalValidFd'] += to_float(row[VALID_FD]) if len(row) > VALID_FD else 0
            summary_for_display['totalSuspended'] += to_float(row[SUSPENDED_FD]) if len(row) > SUSPENDED_FD else 0
            summary_for_display['totalSalary'] += to_float(row[SALARY]) if len(row) > SALARY else 0
            if 'VIEW_COMMISSION' in current_user.permissions:
                current_fd = to_float(row[VALID_FD]) if len(row) > VALID_FD else 0
                current_rate = to_float(row[RATE]) if len(row) > RATE else 0
                commission_multiplier = commission_map.get(current_rate, 0)
                summary_for_display['totalCommission'] += (current_fd * commission_multiplier)
        except IndexError as e: 
            logging.warning(f"Skipping row during summary calculation due to missing columns: {row} -> {e}")
    if overall_total_valid_fd >= 6000:
        if search_ba_names_lower: summary_for_display['totalIncentives'] = sum(ba_incentives_map.get(name.upper(), 0) for name in ba_names)
        elif 'SEARCH_ALL' in current_user.permissions: summary_for_display['totalIncentives'] = sum_of_all_individual_incentives
    return jsonify({ "baNameDisplay": ba_display_name, "searchCriteria": search_criteria_frontend, "summary": summary_for_display, "monthDisplay": search_month.upper(), "weekDisplay": search_week.upper(), "dateRangeDisplay": date_range_display, "status": "Active", "resultsTable": results_for_table, "rankedBaList": final_ranked_ba_list, "lastUpdate": last_update_timestamp })

@app.route('/api/save_dashboard', methods=['POST'])
@login_required
def save_dashboard():
    if 'EDIT_TABLE' not in current_user.permissions:
        return jsonify({"success": False, "error": "Unauthorized"}), 403
    updated_rows_from_client = request.get_json()
    if not updated_rows_from_client:
        return jsonify({"success": False, "error": "No data received"}), 400
    try:
        all_sheet_data = get_sheet_data(DATABASE_SHEET_ID, f"{DATABASE_SHEET_NAME}!A:L")
        if not all_sheet_data:
            return jsonify({"success": False, "error": "Could not fetch current database state."}), 500

        # Build a list of all rows for matching
        update_requests = []
        editable_cols = {
            'month': {'idx': 1, 'col': 'B'}, 'week': {'idx': 2, 'col': 'C'}, 'ba_name': {'idx': 3, 'col': 'D'},
            'reg': {'idx': 4, 'col': 'E'}, 'valid_fd': {'idx': 5, 'col': 'F'}, 'suspended_fd': {'idx': 6, 'col': 'G'},
            'total_ggr': {'idx': 9, 'col': 'J'}, 'status': {'idx': 11, 'col': 'L'}
        }
        for client_row in updated_rows_from_client:
            palcode = client_row.get('palcode', '').strip()
            month = client_row.get('month', '').strip()
            week = client_row.get('week', '').strip()
            ba_name = client_row.get('ba_name', '').strip()
            # Find the exact row matching all four fields
            original_index = None
            original_row = None
            for i, row in enumerate(all_sheet_data):
                if (
                    len(row) > 3 and
                    str(row[0]).strip() == palcode and
                    str(row[1]).strip() == month and
                    str(row[2]).strip() == week and
                    str(row[3]).strip() == ba_name
                ):
                    original_row = row
                    original_index = i + 1  # 1-based for Google Sheets
                    break
            if original_row and original_index:
                for field, col_info in editable_cols.items():
                    col_idx = col_info['idx']
                    original_value = original_row[col_idx] if len(original_row) > col_idx else ""
                    client_value = client_row.get(field, "")
                    if str(original_value).strip() != str(client_value).strip():
                        update_requests.append({
                            "range": f"'{DATABASE_SHEET_NAME}'!{col_info['col']}{original_index}",
                            "values": [[client_value]]
                        })
        if not update_requests:
            return jsonify({"success": True, "message": "No changes detected to save."})
        batch_update_body = { 'valueInputOption': 'USER_ENTERED', 'data': update_requests }
        sheet_api.values().batchUpdate(spreadsheetId=DATABASE_SHEET_ID, body=batch_update_body).execute()
        log_user_event('saveDashboardData', {'updated_palcodes': [r['palcode'] for r in updated_rows_from_client]})
        notify_dashboard_clients()  # Notify clients about the update
        return jsonify({"success": True, "message": f"Successfully updated {len(update_requests)} cells."})
    except Exception as e:
        logging.error(f"Error saving dashboard data: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

# *** MODIFIED ***: Payout submission now overwrites previous entries by the same user.
@app.route('/api/payout/submit', methods=['POST'])
@login_required
def submit_payout():
    ba_name = request.form.get('ba_name', '').strip()
    mop_account_name = request.form.get('mop_account_name', '').strip()
    mop_number = request.form.get('mop_number', '').strip()
    qr_file = request.files.get('qr_image')

    if not all([ba_name, mop_account_name, mop_number, qr_file]):
        return jsonify({'success': False, 'error': 'All fields are required.'}), 400

    payout_info_path = os.path.join(PAYOUT_UPLOAD_FOLDER, 'payout_submissions.json')
    submissions = []
    was_overwritten = False

    try:
        # Load existing submissions if the file exists
        if os.path.exists(payout_info_path):
            with open(payout_info_path, 'r', encoding='utf-8') as f:
                submissions = json.load(f)

        # Check for and remove any existing submission from the current user
        current_user_email = current_user.email
        existing_submission = next((sub for sub in submissions if sub.get('user_email') == current_user_email), None)

        if existing_submission:
            was_overwritten = True
            submissions = [sub for sub in submissions if sub.get('user_email') != current_user_email]

        # Save the new QR file locally only
        filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{secure_filename(qr_file.filename)}"
        upload_file_locally(qr_file.stream, filename)

        # --- Use Asia/Manila timezone for submitted_at ---
        import pytz
        manila_tz = pytz.timezone('Asia/Manila')
        submitted_at = datetime.now(manila_tz).strftime('%Y-%m-%dT%H:%M:%S%z')

        # Add the new submission (store only the filename)
        submissions.append({
            'user_email': current_user_email,
            'ba_name': ba_name,
            'mop_account_name': mop_account_name,
            'mop_number': mop_number,
            'qr_image': filename,
            'submitted_at': datetime.now().isoformat()
        })


        # Write the updated list back to the file (still local for metadata)
        with open(payout_info_path, 'w', encoding='utf-8') as f:
            json.dump(submissions, f, indent=2)

    except Exception as e:
        logging.error(f"Error during payout submission: {e}")
        return jsonify({'success': False, 'error': 'Failed to save payout info.'}), 500

    message = "Payout info updated successfully. Your previous submission was overwritten." if was_overwritten else "Payout info submitted successfully."
    return jsonify({'success': True, 'message': message})

@app.route('/api/payout/delete', methods=['POST'])
@login_required
def delete_payout():
    if not current_user.is_admin:
        return jsonify({'success': False, 'error': 'Forbidden'}), 403
    data = request.get_json()
    payout_id = data.get('id')
    if not payout_id:
        return jsonify({'success': False, 'error': 'Payout ID is required.'}), 400
    payout_info_path = os.path.join(PAYOUT_UPLOAD_FOLDER, 'payout_submissions.json')
    try:
        with open(payout_info_path, 'r', encoding='utf-8') as f:
            submissions = json.load(f)
    except FileNotFoundError:
        return jsonify({'success': False, 'error': 'Submissions file not found.'}), 404
    except json.JSONDecodeError:
        return jsonify({'success': False, 'error': 'Could not read submissions file.'}), 500
    payout_to_delete = None
    for p in submissions:
        if p.get('submitted_at') == payout_id:
            payout_to_delete = p
            break
    if not payout_to_delete:
        return jsonify({'success': False, 'error': 'Payout submission not found.'}), 404
    # Optionally: delete from GCS here if you want (not required for basic fix)
    updated_submissions = [p for p in submissions if p.get('submitted_at') != payout_id]
    try:
        with open(payout_info_path, 'w', encoding='utf-8') as f:
            json.dump(updated_submissions, f, indent=2)
    except Exception as e:
        logging.error(f"Error writing updated submissions file: {e}")
        return jsonify({'success': False, 'error': 'Could not update submissions file.'}), 500
    return jsonify({'success': True, 'message': 'Submission deleted successfully.'})

@app.route('/api/payout/list', methods=['GET'])
@login_required
def list_payouts():
    payout_info_path = os.path.join(PAYOUT_UPLOAD_FOLDER, 'payout_submissions.json')
    if not os.path.exists(payout_info_path):
        return jsonify({'success': True, 'payouts': []})
    try:
        with open(payout_info_path, 'r', encoding='utf-8') as f:
            submissions = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return jsonify({'success': True, 'payouts': []})

    # Admins and VIEW_PAYOUTS see all, others see only their own
    if getattr(current_user, 'is_admin', False) or 'VIEW_PAYOUTS' in getattr(current_user, 'permissions', []):
        visible_submissions = submissions
    else:
        visible_submissions = [s for s in submissions if s.get('user_email', '').lower() == current_user.email.lower()]

    # qr_image is now a GCS URL
    return jsonify({'success': True, 'payouts': visible_submissions})

@app.route('/uploads/<filename>')
@login_required
def uploaded_file(filename):
    return send_from_directory(PAYOUT_UPLOAD_FOLDER, filename)

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
        # --- Split inputs into separate columns ---
        month = inputs.get('month', 'N/A')
        week = inputs.get('week', 'N/A').replace('week ', '')
        ba_names = ', '.join(inputs.get('baNames', [])) if inputs.get('baNames') else "N/A"
        if function_name == 'saveDashboardData':
            formatted_inputs = f"Updated data for {len(inputs.get('updated_palcodes', []))} palcodes."
            new_row_data = [timestamp, user_email, function_name, formatted_inputs, '', '', '']
        else:
            new_row_data = [timestamp, user_email, function_name, month, week, ba_names]
        requests_body = [
            { "insertDimension": { "range": { "sheetId": logs_sheet_id, "dimension": "ROWS", "startIndex": 1, "endIndex": 2 } } },
            { "updateCells": { "rows": [ { "values": [ {"userEnteredValue": {"stringValue": str(cell)}} for cell in new_row_data ] } ], "fields": "userEnteredValue", "start": { "sheetId": logs_sheet_id, "rowIndex": 1, "columnIndex": 0 } } }
        ]
        sheet_api.batchUpdate(spreadsheetId=LOGS_SHEET_ID, body={'requests': requests_body}).execute()
    except Exception as e:
        logging.error(f"Error logging event by inserting row: {e}")

def find_user_row(users_sheet, email):
    email = email.strip().lower()
    for idx, row in enumerate(users_sheet):
        if len(row) > 1 and row[1].strip().lower() == email:
            return idx
    return -1

# --- Helper to get data from either DATABASE or REDATABASE ---
def get_database_data(use_redatabase=False, range_str="A:L"):
    """
    Helper to fetch data from DATABASE or REDATABASE.
    Set use_redatabase=True to fetch from REDATABASE.
    """
    sheet_name = REDATABASE_SHEET_NAME if use_redatabase else DATABASE_SHEET_NAME
    return get_sheet_data(DATABASE_SHEET_ID, f"{sheet_name}!{range_str}")

@app.route('/api/some-protected-endpoint')
@login_required
def some_protected():
    if 'SPECIAL_PERMISSION' not in current_user.permissions:
        return jsonify({'error': 'Forbidden'}), 403
    # ...existing code...

# --- Dashboard Events Streaming ---
# Global list of queues for connected clients
dashboard_event_queues = []

@app.route('/events/dashboard')
@login_required
def dashboard_events():
    def event_stream(q):
        try:
            while True:
                msg = q.get()
                yield f"data: {msg}\n\n"
        except GeneratorExit:
            pass

    q = queue.Queue()
    dashboard_event_queues.append(q)
    try:
        return Response(event_stream(q), mimetype="text/event-stream")
    finally:
        dashboard_event_queues.remove(q)

def notify_dashboard_clients():
    # Call this after dashboard data changes
    for q in dashboard_event_queues:
        q.put("update")

if __name__ == '__main__':
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
    app.run(host='0.0.0.0', port=5001, debug=True)