Configuration templates.

Desktop:   cd $HOME && cp -rf ~/gel_data_resources/example_config_files/Workspaces/. .
HPC:       cp -rf /gel_data_resources/example_config_files/Double_Helix/. ./

Then edit ~/.netrc: put your username (initial + last name, e.g. jdoe) and your
RE password in place of yourusername / yourPasswordHere, and make the file
private:   chmod 600 ~/.netrc
The LabKey API reads your credentials from ~/.netrc.
