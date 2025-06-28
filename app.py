import os
import json
from datetime import datetime, timedelta
from flask import Flask, jsonify, render_template, request, redirect, url_for, session
from flask_login import LoginManager, current_user, login_required, login_user, logout_user, UserMixin
from google.oauth2 import service_account
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import Flow
import logging
import requests
import pytz
import uuid
from werkzeug.utils import secure_filename
from google.cloud import storage
from google.api_core import exceptions

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
    'EDIT_TABLE',
    'VIEW_COMMISSION',
    'VIEW_PAYOUTS',
    'SEARCH_ALL'
}
YOUR_TIMEZONE = 'Asia/Manila'

# --- Google Cloud Storage Configuration ---
# *** CORRECTED ***: Bucket name updated to match your screenshot.
GCS_BUCKET_NAME = 'payout-uploads'
GCS_CREDENTIALS_FILE = 'gcs_credentials.json'
PAYOUT_SUBMISSIONS_FILENAME = 'payout_submissions.json'

# --- Flask App Initialization ---
app = Flask(__name__)
app.secret_key = os.urandom(24)

# --- User and Login Management ---
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

# --- Google API Setup (Sheets & Storage) ---
creds_service_account = None
storage_client = None
try:
    if 'GOOGLE_CREDENTIALS_JSON' in os.environ:
        creds_json = json.loads(os.environ.get('GOOGLE_CREDENTIALS_JSON'))
        creds_service_account = service_account.Credentials.from_service_account_info(creds_json, scopes=['https://www.googleapis.com/auth/spreadsheets'])
    else:
        KEY_FILE_LOCATION = os.path.join(os.path.dirname(__file__), 'credentials.json')
        creds_service_account = service_account.Credentials.from_service_account_file(KEY_FILE_LOCATION, scopes=['https://www.googleapis.com/auth/spreadsheets'])
    
    service = build('sheets', 'v4', credentials=creds_service_account)
    sheet_api = service.spreadsheets()
    logging.info("Successfully connected to Google Sheets API.")

    if os.path.exists(GCS_CREDENTIALS_FILE):
        storage_client = storage.Client.from_service_account_json(GCS_CREDENTIALS_FILE)
        logging.info("Successfully connected to Google Cloud Storage.")
    else:
        logging.warning(f"GCS credentials file ('{GCS_CREDENTIALS_FILE}') not found. Payout functionality will be disabled.")

except Exception as e:
    logging.error(f"FATAL ERROR: Could not load Google credentials. {e}")
    sheet_api = None
    storage_client = None

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
    flow = Flow.from_client_secrets_file('client_secret.json', scopes=['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email', 'openid'], redirect_uri=url_for('callback', _external=True))
    authorization_url, state = flow.authorization_url()
    session["state"] = state
    return redirect(authorization_url)

@app.route("/callback")
def callback():
    flow = Flow.from_client_secrets_file('client_secret.json', scopes=['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email', 'openid'], state=session["state"], redirect_uri=url_for('callback', _external=True))
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
    user_data = get_sheet_data(DATABASE_SHEET_ID, f"{USERS_SHEET_NAME}!B:E")
    if not user_data or len(user_data) < 2:
        return jsonify({'users': [], 'all_permissions': sorted(list(ALL_PERMISSIONS))})
    users_list = []
    admin_emails_lower = [email.lower() for email in ADMIN_USER_EMAILS]
    for row in user_data[1:]:
        if len(row) >= 2:
            user_email = row[0].lower()
            user_name = row[1]
            users_list.append({
                'name': user_name,
                'email': user_email,
                'is_admin': user_email in admin_emails_lower,
                'permissions': row[3].split(",") if len(row) > 3 and row[3] else []
            })
    return jsonify({"users": users_list, "all_permissions": sorted(list(ALL_PERMISSIONS))})

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
    sheet_api.values().update(spreadsheetId=DATABASE_SHEET_ID, range=range_to_update, valueInputOption='RAW', body={'values': [[permissions_string]]}).execute()
    return jsonify({"success": True, "message": f"Permissions for {target_email} updated."})

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
    if overall_total_valid_fd >= 6000:
        for i, ba in enumerate(final_ranked_ba_list):
            rank, incentive = i + 1, 0
            if rank == 1: incentive = 3000
            elif rank == 2: incentive = 1500
            elif rank == 3: incentive = 900
            elif 4 <= rank <= 6: incentive = 500
            elif rank > 6 and ba['totalFd'] > 0: incentive = 200
            if incentive > 0:
                ba_incentives_map[ba['originalName'].upper()] = incentive
                sum_of_all_individual_incentives += incentive
    filtered_rows = [row for row in period_data_rows if ((not search_ba_names_lower or (len(row) > BA_NAME and row[BA_NAME].strip().lower() in search_ba_names_lower)) and (not search_palcode_lower or (len(row) > PALCODE and row[PALCODE].strip().lower() == search_palcode_lower)))]
    results_for_table = filtered_rows
    commission_map = { 25.00: 5, 60.00: 10, 80.00: 20, 90.00: 10, 140.00: 10, 230.00: 20, 325.00: 25, 420.00: 30 }
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
        row_map = {}
        for i, row in enumerate(all_sheet_data):
            if len(row) > 2:
                key = f"{row[0]}|{row[1]}|{row[2]}"
                row_map[key] = {'data': row, 'index': i + 1}
        update_requests = []
        editable_cols = {
            'month': {'idx': 1, 'col': 'B'}, 'week': {'idx': 2, 'col': 'C'}, 'ba_name': {'idx': 3, 'col': 'D'},
            'reg': {'idx': 4, 'col': 'E'}, 'valid_fd': {'idx': 5, 'col': 'F'}, 'suspended_fd': {'idx': 6, 'col': 'G'},
            'total_ggr': {'idx': 9, 'col': 'J'}, 'status': {'idx': 11, 'col': 'L'}
        }
        for client_row in updated_rows_from_client:
            palcode = client_row.get('palcode')
            original_month = client_row.get('original_month')
            original_week = client_row.get('original_week')
            key = f"{palcode}|{original_month}|{original_week}"
            if key in row_map:
                original_row = row_map[key]['data']
                original_index = row_map[key]['index']
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
        return jsonify({"success": True, "message": f"Successfully updated {len(update_requests)} cells."})
    except Exception as e:
        logging.error(f"Error saving dashboard data: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# --- Payout Functions using Google Cloud Storage ---

@app.route('/api/payout/submit', methods=['POST'])
@login_required
def submit_payout():
    if not storage_client:
        return jsonify({'success': False, 'error': 'Storage service is not configured.'}), 500

    ba_name = request.form.get('ba_name', '').strip()
    mop_account_name = request.form.get('mop_account_name', '').strip()
    mop_number = request.form.get('mop_number', '').strip()
    qr_file = request.files.get('qr_image')

    if not all([ba_name, mop_account_name, mop_number, qr_file]):
        return jsonify({'success': False, 'error': 'All fields are required.'}), 400

    try:
        bucket = storage_client.bucket(GCS_BUCKET_NAME)
        json_blob = bucket.blob(PAYOUT_SUBMISSIONS_FILENAME)
        
        submissions = []
        try:
            submissions_json = json_blob.download_as_string()
            submissions = json.loads(submissions_json)
        except exceptions.NotFound:
            logging.info(f"{PAYOUT_SUBMISSIONS_FILENAME} not found in bucket. A new file will be created.")
        
        current_user_email = current_user.email
        was_overwritten = False
        existing_submission = next((sub for sub in submissions if sub.get('user_email') == current_user_email), None)
        
        if existing_submission:
            was_overwritten = True
            old_gcs_path = existing_submission.get('gcs_image_path')
            if old_gcs_path:
                old_image_blob = bucket.blob(old_gcs_path)
                try:
                    old_image_blob.delete()
                    logging.info(f"Overwriting: Deleted old GCS image {old_gcs_path}")
                except exceptions.NotFound:
                    logging.warning(f"Old GCS image not found for deletion during overwrite: {old_gcs_path}")
            
            submissions = [sub for sub in submissions if sub.get('user_email') != current_user_email]

        filename = f"{uuid.uuid4()}_{secure_filename(qr_file.filename)}"
        image_blob = bucket.blob(f"qr_images/{filename}")
        image_blob.upload_from_file(qr_file)
        image_blob.make_public()

        new_submission = {
            'user_email': current_user.email,
            'ba_name': ba_name,
            'mop_account_name': mop_account_name,
            'mop_number': mop_number,
            'qr_image': image_blob.public_url,
            'gcs_image_path': image_blob.name, 
            'submitted_at': datetime.now(pytz.timezone(YOUR_TIMEZONE)).isoformat()
        }
        submissions.append(new_submission)
        
        json_blob.upload_from_string(json.dumps(submissions, indent=2), content_type='application/json')

    except Exception as e:
        logging.error(f"Error during GCS payout submission: {e}")
        return jsonify({'success': False, 'error': 'Failed to save payout info to cloud storage.'}), 500
    
    message = "Payout info updated successfully. Your previous submission was overwritten." if was_overwritten else "Payout info submitted successfully."
    return jsonify({'success': True, 'message': message})

@app.route('/api/payout/delete', methods=['POST'])
@login_required
def delete_payout():
    if not current_user.is_admin:
        return jsonify({'success': False, 'error': 'Forbidden'}), 403
    if not storage_client:
        return jsonify({'success': False, 'error': 'Storage service is not configured.'}), 500

    data = request.get_json()
    payout_id = data.get('id')
    if not payout_id:
        return jsonify({'success': False, 'error': 'Payout ID is required.'}), 400

    try:
        bucket = storage_client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob(PAYOUT_SUBMISSIONS_FILENAME)
        submissions_json = blob.download_as_string()
        submissions = json.loads(submissions_json)
        
        payout_to_delete = next((p for p in submissions if p.get('submitted_at') == payout_id), None)
        if not payout_to_delete:
            return jsonify({'success': False, 'error': 'Payout submission not found.'}), 404
            
        gcs_image_path = payout_to_delete.get('gcs_image_path')
        if gcs_image_path:
            image_blob = bucket.blob(gcs_image_path)
            try:
                image_blob.delete()
                logging.info(f"Deleted image from GCS: {gcs_image_path}")
            except exceptions.NotFound:
                logging.warning(f"Image not found in GCS for deletion: {gcs_image_path}")

        updated_submissions = [p for p in submissions if p.get('submitted_at') != payout_id]
        blob.upload_from_string(json.dumps(updated_submissions, indent=2), content_type='application/json')
        
    except exceptions.NotFound:
         return jsonify({'success': False, 'error': 'Submissions file not found in cloud storage.'}), 404
    except Exception as e:
        logging.error(f"Error deleting payout from GCS: {e}")
        return jsonify({'success': False, 'error': 'Could not delete submission from cloud storage.'}), 500

    return jsonify({'success': True, 'message': 'Submission deleted successfully.'})

@app.route('/api/payout/list', methods=['GET'])
@login_required
def list_payouts():
    if not current_user.is_admin and 'VIEW_PAYOUTS' not in current_user.permissions:
        return jsonify({'success': False, 'error': 'Forbidden'}), 403
    if not storage_client:
        return jsonify({'success': False, 'error': 'Storage service is not configured.'}), 500

    try:
        bucket = storage_client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob(PAYOUT_SUBMISSIONS_FILENAME)
        submissions_json = blob.download_as_string()
        submissions = json.loads(submissions_json)
        return jsonify({'success': True, 'payouts': submissions})
    except exceptions.NotFound:
        return jsonify({'success': True, 'payouts': []})
    except Exception as e:
        logging.error(f"Error listing payouts from GCS: {e}")
        return jsonify({'success': False, 'error': 'Could not retrieve payout list.'}), 500

# --- Logging and Main Execution ---
def log_user_event(function_name, inputs):
    if not sheet_api: return
    try:
        # This function can remain as is
        pass
    except Exception as e:
        logging.error(f"Error logging event by inserting row: {e}")

if __name__ == '__main__':
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5001)), debug=True)