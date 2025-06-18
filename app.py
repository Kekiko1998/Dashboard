import os
import json
from datetime import datetime, timedelta
from flask import Flask, jsonify, render_template, request
from google.oauth2 import service_account
from googleapiclient.discovery import build
import logging

# --- Basic Logging Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Configuration ---
DATABASE_SHEET_ID = '1ZufXPOUcoW2czQ0vcpZwvJNHngV4GHbbSl9q46UwF8g'
LOGS_SHEET_ID = '1ZufXPOUcoW2czQ0vcpZwvJNHngV4GHbbSl9q46UwF8g'
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

# --- Environment-aware credential loading ---
creds = None
try:
    if 'GOOGLE_CREDENTIALS_JSON' in os.environ:
        creds_json = json.loads(os.environ.get('GOOGLE_CREDENTIALS_JSON'))
        creds = service_account.Credentials.from_service_account_info(creds_json, scopes=SCOPES)
        logging.info("Loaded credentials from environment variable.")
    else:
        KEY_FILE_LOCATION = os.path.join(os.path.dirname(__file__), 'credentials.json')
        creds = service_account.Credentials.from_service_account_file(KEY_FILE_LOCATION, scopes=SCOPES)
        logging.info(f"Loaded credentials from file: {KEY_FILE_LOCATION}")
except Exception as e:
    logging.error(f"FATAL ERROR: Could not load Google credentials. {e}")

# --- Flask App Initialization & API Setup ---
app = Flask(__name__)
service = build('sheets', 'v4', credentials=creds) if creds else None
sheet_api = service.spreadsheets() if service else None


# --- Helper Functions ---
def get_all_sheet_data(sheet_id, sheet_name):
    if not sheet_api:
        logging.error("Cannot fetch sheet data, Google API not initialized.")
        return None
    try:
        result = sheet_api.values().get(spreadsheetId=sheet_id, range=f"{sheet_name}!A:L").execute()
        return result.get('values', [])
    except Exception as e:
        logging.error(f"Error fetching sheet data for {sheet_name}: {e}")
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

        start_month_name = selected_week_start_date.strftime("%B").upper()
        end_month_name = selected_week_end_date.strftime("%B").upper()
        
        if start_month_name == end_month_name:
            return f"{start_month_name} {selected_week_start_date.day} - {selected_week_end_date.day}"
        else:
            return f"{start_month_name} {selected_week_start_date.day} - {end_month_name} {selected_week_end_date.day}"
    except Exception as e:
        logging.error(f"Error in calculate_date_range: {e}")
        return ""

# --- Routes ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/user-info', methods=['GET'])
def get_user_info():
    return jsonify({ "email": "admin@example.com", "isSpecial": True })

@app.route('/api/ba-names', methods=['GET'])
def get_unique_ba_names():
    try:
        data = get_all_sheet_data(DATABASE_SHEET_ID, 'DATABASE')
        if not data or len(data) <= 1: return jsonify([])
        ba_name_column_index = 3
        ba_names = set(row[ba_name_column_index].strip() for row in data[1:] if len(row) > ba_name_column_index and row[ba_name_column_index])
        return jsonify(sorted(list(ba_names)))
    except Exception as e:
        logging.error(f"Error in get_unique_ba_names: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/search', methods=['POST'])
def search_dashboard_data():
    # ===============================================================
    # --- THIS IS THE ROBUST HELPER FUNCTION FOR NUMBER CONVERSION ---
    # ===============================================================
    def to_float(value):
        """
        Safely converts a string value to a float, handling currency symbols,
        commas, and other non-numeric text.
        """
        if isinstance(value, (int, float)):
            return float(value)
        if not isinstance(value, str):
            return 0.0
        
        # Clean the string: remove whitespace, currency symbols, and commas
        cleaned_value = value.strip().replace('₱', '').replace(',', '')
        
        # If the string is empty after cleaning, it's zero
        if not cleaned_value:
            return 0.0
            
        try:
            return float(cleaned_value)
        except (ValueError, TypeError):
            # If conversion fails for any other reason (e.g., text like '-'), return 0
            return 0.0
    # ===============================================================

    req_data = request.get_json()
    month, week, ba_names, palcode = req_data.get('month'), req_data.get('week'), req_data.get('baNames', []), req_data.get('palcode', '')
    is_special_user = True
    
    if not month or not week: return jsonify({"error": "Month and Week are required search criteria."}), 400
    if not is_special_user and not ba_names: return jsonify({"error": "BA Name is required for your search."}), 400
    
    all_sheet_data = get_all_sheet_data(DATABASE_SHEET_ID, 'DATABASE')
    if all_sheet_data is None: return jsonify({"error": "Database sheet not found or API connection failed."}), 500
        
    log_user_event('searchDashboardData', req_data)

    search_month, search_week = month.strip().lower(), week.strip().lower()
    search_ba_names_lower = [str(name).strip().lower() for name in ba_names if name]
    search_palcode_lower = palcode.strip().lower() if palcode else ""

    PALCODE, MONTH, WEEK, BA_NAME, REG, VALID_FD, SUSPENDED_FD, RATE, GGR_PER_FD, TOTAL_GGR, SALARY, STATUS = 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11

    period_data_rows = [row for row in all_sheet_data[1:] if len(row) > WEEK and row[MONTH].strip().lower() == search_month and row[WEEK].strip().lower() == search_week]

    ba_display_name = "ALL BAs" if is_special_user and not search_ba_names_lower else (f"MULTIPLE BAs ({len(search_ba_names_lower)})" if len(search_ba_names_lower) > 1 else (ba_names[0].strip().upper() if search_ba_names_lower else "N/A"))
    
    search_criteria_frontend = {'baNames': [name.strip().upper() for name in ba_names]}
    date_range_display = calculate_date_range(month, week)

    if not period_data_rows:
        return jsonify({ "baNameDisplay": ba_display_name, "searchCriteria": search_criteria_frontend, "summary": {"totalRegistration": 0, "totalValidFd": 0, "totalSuspended": 0, "totalSalary": 0, "totalIncentives": 0}, "monthDisplay": search_month.upper(), "weekDisplay": search_week.upper(), "dateRangeDisplay": date_range_display, "status": "N/A", "resultsTable": [], "rankedBaList": [], "lastUpdate": datetime.now().strftime('%Y-%m-%d %H:%M:%S'), "message": "No matching records found for the selected period." })

    overall_total_valid_fd, ba_period_fds = 0, {}
    for row in period_data_rows:
        try:
            current_fd = to_float(row[VALID_FD]) if len(row) > VALID_FD else 0
            overall_total_valid_fd += current_fd
            ba_name = row[BA_NAME].strip() if len(row) > BA_NAME and row[BA_NAME] else "Unknown BA"
            if ba_name not in ba_period_fds:
                ba_period_fds[ba_name] = {"originalName": ba_name, "totalFd": 0}
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

    results_for_table, summary_for_display = [], {"totalRegistration": 0, "totalValidFd": 0, "totalSuspended": 0, "totalSalary": 0, "totalIncentives": 0}

    for row in filtered_rows:
        try:
            results_for_table.append([row[i] if len(row) > i else "" for i in [PALCODE, BA_NAME, REG, VALID_FD, SUSPENDED_FD, RATE, GGR_PER_FD, TOTAL_GGR, SALARY, STATUS]])
            
            # Use the new robust helper for ALL calculations
            summary_for_display['totalRegistration'] += to_float(row[REG]) if len(row) > REG else 0
            summary_for_display['totalValidFd'] += to_float(row[VALID_FD]) if len(row) > VALID_FD else 0
            summary_for_display['totalSuspended'] += to_float(row[SUSPENDED_FD]) if len(row) > SUSPENDED_FD else 0
            summary_for_display['totalSalary'] += to_float(row[SALARY]) if len(row) > SALARY else 0

        except IndexError as e:
            logging.warning(f"Skipping row due to missing columns: {row} -> {e}")
            continue
            
    if overall_total_valid_fd >= 6000:
        if search_ba_names_lower:
            for name in ba_names:
                summary_for_display['totalIncentives'] += ba_incentives_map.get(name.upper(), 0)
        elif is_special_user:
            summary_for_display['totalIncentives'] = sum_of_all_individual_incentives

    return jsonify({ "baNameDisplay": ba_display_name, "searchCriteria": search_criteria_frontend, "summary": summary_for_display, "monthDisplay": search_month.upper(), "weekDisplay": search_week.upper(), "dateRangeDisplay": date_range_display, "status": "Active", "resultsTable": results_for_table, "rankedBaList": final_ranked_ba_list, "lastUpdate": datetime.now().strftime('%A, %B %d, %Y, %I:%M:%S %p') })

def log_user_event(function_name, inputs):
    if not sheet_api: return
    try:
        timestamp = datetime.now().strftime('%A, %B %d, %Y, %I:%M:%S %p')
        user_email = "admin@example.com"
        ba_names_str = ', '.join(inputs.get('baNames', [])) if inputs.get('baNames') else "N/A"
        formatted_inputs = f"Month - {inputs.get('month', 'N/A')}, Week - {inputs.get('week', 'N/A').replace('week ', '')}, Ba Name(s) - {ba_names_str}, Palcode - {inputs.get('palcode', 'N/A') or 'N/A'}"
        row_to_append = [timestamp, user_email, function_name, formatted_inputs]
        sheet_api.values().append(spreadsheetId=LOGS_SHEET_ID, range='Web App Logs!A1', valueInputOption='USER_ENTERED', body={'values': [row_to_append]}).execute()
    except Exception as e:
        logging.error(f"Error logging event: {e}")

if __name__ == '__main__':
    if not creds:
        logging.error("Application cannot start because Google API connection failed. Please check credentials.")
    else:
        app.run(host='0.0.0.0', port=5001, debug=True)