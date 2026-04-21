import json, csv, zipfile, subprocess, os, sys, logging, argparse
from datetime import datetime

logging.basicConfig(level=logging.INFO,
                    format="%(levelname)s: %(message)s")

class Pbiviz_Packager:

    def __init__(self, code_folder, output_folder, csvpath=None) -> None:
        self.code_folder = code_folder
        self.csvpath = csvpath
        self.output_folder = output_folder
        if csvpath and not os.path.exists(csvpath):
            raise RuntimeError("Specified CSV file not found")
        
    def get_git_commit(self):
        # get most recent commit using git command
        result = subprocess.run(
            ['git', 'rev-parse', '--short=6', 'HEAD'], capture_output=True, text=True)
        commit_hash = result.stdout.strip("\n")
        return commit_hash
    
    def calculate_output_details(self):
        '''Populates necessary instance variables, comprising version number and the filename that 
        we expect pbiviz package will create for us based on this (we can't control it!)'''
        timestamp = datetime.now().strftime('%Y%m%d%H%M')
        git_commit_hash = self.get_git_commit()
        updated_version_number = f"0.0.0.{git_commit_hash}_{timestamp}"
        self.version_number = updated_version_number
        pbiviz_json_path = os.path.join(self.code_folder, "pbiviz.json")
        with open(pbiviz_json_path) as file:
            pbiviz_json = json.load(file)
        guid = pbiviz_json['visual']['guid']
        expected_output_filename = f"{guid}.{self.version_number}.pbiviz"
        self.expected_output_file = os.path.join(self.code_folder, 'dist', expected_output_filename)
        self.expected_output_json = f"{guid}.pbiviz.json"

    def update_version_in_json(self):
        '''Replaces the version in the pbiviz.json file with a string based on the current date and git commit ref'''
        pbiviz_json_path = os.path.join(self.code_folder, "pbiviz.json")
        with open(pbiviz_json_path) as file:
            pbiviz_json = json.load(file)
        # Update version number
        pbiviz_json['visual']['version'] = self.version_number
        # write out json
        with open(pbiviz_json_path, 'w') as file:
            json.dump(pbiviz_json, file, indent=4)

    def package_pbiviz(self):
        '''Calls pbiviz package to actually package the visual. It will be written to the dist subfolder of the code 
        folder and will have a filename based on the GUID and version from pbiviz.json.'''
        self.update_version_in_json()
        # Get path to pbiviz powershell script
        result = subprocess.run(['powershell.exe', '-Command', '(Get-Command pbiviz).path'], capture_output=True, text=True)
        pbiviz_path = result.stdout.strip("\n")
        # Call pbiviz package command
        subprocess.run(["powershell.exe",
                    pbiviz_path, "package"])  # check=True if want to error handle
        return os.path.exists(self.expected_output_file)

    def create_registered_copies(self):
        '''Creates copies of the visual that has been output by pbiviz package. One copy will be created for each 
        row of the CSV file. Within each, the values {{VISUAL_ID}} and {{EXPIRY_DATE}} will be substituted by 
        the values from the CSV, and the output filename will be named according to the ORG_NAME from the CSV'''
        copies = self.get_reg_details()
        out_folder = self.output_folder
        os.makedirs(out_folder, exist_ok=True)
        logging.debug(f"Will now create the following copies: \n{copies}")
        for id, org_name, build_expiry in copies:
            out_name = os.path.join(out_folder, f"OS_Maps_Visual_{org_name}.pbiviz")
            replacements_to_make = [
                ("{{VISUAL_ID}}", id),
                ("{{EXPIRY_DATE}}", build_expiry),
                ("{{APP_INSIGHTS}}", os.environ("APP_INSIGHTS"))
            ]
            self.replace_id_placeholders(
                self.expected_output_file, 
                out_name,
                replacements_to_make
                #,self.expected_output_json
            )
            
    def get_reg_details(self):
        ''' Parses the input csv file to get details of the copies of the visual that should be created. 
         If there is no input csv, then creates a single copy with the placeholders unmodified and the 
          file named Ordnance Survey '''
        items = []
        if not self.csvpath:
            # if called with no CSV, then do not actually replace the placeholder strings in the built 
            # visual, just copy it to a new file with Ordnance Survey in the filename
            return [
                ('{{VISUAL_ID}}', 'Ordnance Survey', '{{EXPIRY_DATE}}')
            ]
        with open(self.csvpath) as licencefile:
            reader = csv.DictReader(licencefile)
            for row in reader:
                items.append((row['visual_id'], row['org_name'], row['expiry']))
        return items

    def replace_id_placeholders(self, pbiviz_zip_input, pbiviz_zip_output, replacements_to_make, filename_in_zip=None):
        '''For a given input zip file, for every file within the zip or a specific single file within it, replaces 
        a number of strings with substitute values, creating a new output zip file.'''
        with zipfile.ZipFile(pbiviz_zip_input, 'r') as zip_read:
            with zipfile.ZipFile(pbiviz_zip_output, 'w') as zip_write:
                replaced = 0
                for item in zip_read.infolist():
                    if not replaced==len(replacements_to_make) and (filename_in_zip==None or item.filename == filename_in_zip):
                        # Read the content of the target file
                        with zip_read.open(item) as file:
                            content = file.read().decode('utf-8')
                        # Replace the string
                        for id_placeholder, id_value in replacements_to_make:
                            if id_placeholder in content:
                                content = content.replace(id_placeholder, id_value, 1)
                                logging.debug(f"Replaced placeholder in file {item.filename}")
                                replaced += 1
                            elif item.filename == filename_in_zip:
                                raise RuntimeError("cannot find the requested filename in zip")
                            else:
                                logging.debug(f"Placeholder {id_placeholder} not found in {item.filename}")
                        # Write the modified content to the new zip file
                        zip_write.writestr(item, content)
                    else:
                        # Copy other files without modification
                        logging.debug(f"File copied directly as replacment already done: {item.filename}")
                        zip_write.writestr(item, zip_read.read(item.filename))
            if not replaced == len(replacements_to_make):
                os.remove(pbiviz_zip_output)
                logging.error(
                    f"Cannot find some of the placeholder strings, the output file has not been created")
            else:
                logging.info(
                    f"Output file {pbiviz_zip_output} created with visual_id {replacements_to_make[0][1]} and expiry date {replacements_to_make[1][1]}"
                )
    def RunBuild(self):
        self.calculate_output_details()
        self.update_version_in_json()
        build_success = self.package_pbiviz()
        if(build_success):
            self.create_registered_copies()


def main(out_folder, input_csv):
    #csvfile =  r"C:\Documents_Local\Projects_Local\repos\osmaps-powerbi-api\OS_PowerBI_API\database\visual_ids.csv"
    packager = Pbiviz_Packager(
        code_folder=os.path.abspath('.') , 
        output_folder=out_folder,
        csvpath=input_csv)
    packager.RunBuild()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        "Package the PBI visual, giving it a version number which includes the git commit hash and build time. "+
        "Optionally create multiple copies of the output file which have different values of the VISUAL_ID "+
        "internal property, with filename corresponding to the organisation to whom that ID is "+
        "allocated.")
    parser.add_argument("output_folder", type=str, help="Path to the destination/output folder")
    parser.add_argument("--input_csv", type=str, default= None, help=
                        "Path to the input CSV file. Must contain columns named visual_id, org_name and expiry. One copy of the "+
                        "visual will be output for each row of the CSV. This CSV should be the same one that is used "+
                        "by the PowerBI API to check authorisation!! If not provided then a single copy of the visual "+
                        "will be created with default visual id. ")
    #parser.add_argument("expiry_date", type=lambda d: datetime.strptime(d, '%Y-%m-%d'))
    
    args = parser.parse_args()
    main(args.output_folder, args.input_csv)#, args.expiry_date)

    