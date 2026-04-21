# Introduction 
This repo contains a custom PowerBI visual for displaying data on OS maps backdrop mapping.

# Getting Started
- [Set up your environment](https://learn.microsoft.com/en-us/power-bi/developer/visuals/environment-setup) for developing the visual:
    - `npm install`
    - `pbiviz start`
- if visual doesn't show up go to local host (e.g. https://localhost:8080/), if it's 'unsafe' click through to continue anyway then go to /assets and then refresh visual and it should work.

# Building

If just building once on the fly, run: `python pbiviz_package.py`. To create builds for customers there are a few steps to follow:

1. Open the visual repo in your vscode, stash/commit anything you're already working on, and git checkout the branch with the necessary build tag (i.e. ```git checkout private-beta-20241016```)

2. If making builds for customers you will need to add a GUID, customer name, and visual expiry date to the `visual_ids.csv` which is probably in [OneDrive - Ordnance Survey\Shared Documents - Geospatial Data Insights Team\PowerBI\Releases](https://ordnancesurvey.sharepoint.com/:f:/t/GeospatialDataInsightsTeam/ElDUB5-BKcFEq-NO-2hKXHIB0-HedLOp3QB7aAFg9Y0OfQ?e=Rd3Xof). Preferably edit in notepad or something that isn't excel to keep the formatting.

3. Run the build script: 
```python pbiviz_distrib.py <path to releases folder> --input_csv <path to visual_ids.csv>```

4. You'll have to update the api too. Go to [azure portal > gdisquadstorage > File Shares > os-powerbi-api-storage > Browse](https://portal.azure.com/#view/Microsoft_Azure_FileStorage/FileShareMenuBlade/~/browse/storageAccountId/%2Fsubscriptions%2F23be6a22-0e0b-43eb-8492-15617cdb88b0%2FresourceGroups%2Fgdisgdi1_rg%2Fproviders%2FMicrosoft.Storage%2FstorageAccounts%2Fgdisquadstorage/path/os-powerbi-api-storage/protocol/SMB) and update the visual_ids.csv file then [restart the api](https://portal.azure.com/#@OrdnanceSurvey.onmicrosoft.com/resource/subscriptions/23be6a22-0e0b-43eb-8492-15617cdb88b0/resourceGroups/gdisgdi1_rg_powerbi/providers/Microsoft.Web/sites/os-powerbi-api/appServices). Check it works by going to the [swagger docs](https://os-powerbi-api.azurewebsites.net/docs#/default/get_is_authorised_auth__get) > Try it out > and executing a GUID in the visual_ids field.

5. You could also check the visual in Power BI by uploading it as a file and checking if it says the customer name at the top of the landing page.



