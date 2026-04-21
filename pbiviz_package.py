# pbiviz_package.py
# Sets version number in pbiviz.json to most recent git commit and
# datetimestamp down to the minute then runs pbiviz package
import json
import subprocess
from datetime import datetime


def get_git_commit():
    # get most recent commit using git command
    result = subprocess.run(
        ['git', 'rev-parse', '--short=6', 'HEAD'], capture_output=True, text=True)
    commit_hash = result.stdout.strip("\n")
    return commit_hash


def update_version(pbiviz_json_path):
    # Get timestamp
    timestamp = datetime.now().strftime('%Y%m%d%H%M')
    git_commit_hash = get_git_commit()
    updated_version_number = f"0.0.0.{git_commit_hash}_{timestamp}"

    with open(pbiviz_json_path) as file:
        pbiviz_json = json.load(file)
    # Update version number
    pbiviz_json['visual']['version'] = updated_version_number

    # write out json
    with open(pbiviz_json_path, 'w') as file:
        json.dump(pbiviz_json, file, indent=4)


def package_pbiviz():
    pbiviz_json_path = "pbiviz.json"
    update_version(pbiviz_json_path)

    # Get path to pbiviz powershell script
    result = subprocess.run(['powershell.exe', '-Command', '(Get-Command pbiviz).path'], capture_output=True, text=True)
    pbiviz_path = result.stdout.strip("\n")

    # Call pbiviz package command
    subprocess.run(["powershell.exe",
                   pbiviz_path, "package"])  # check=True if want to error handle


package_pbiviz()
