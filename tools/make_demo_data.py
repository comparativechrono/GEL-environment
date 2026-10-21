#!/usr/bin/env python3
"""
Write the small SYNTHETIC dataset that the simulator's data browser (LabKeeper)
loads into its tables:

    python3 tools/make_demo_data.py

    data/labkey/data/<release folder>/index.json   {"tables": {"participant": "participant.tsv", ...}}
    data/labkey/data/<release folder>/<table>.tsv

Every value is invented (fixed random seed), except:
  * the genome files of participant 219000001 - public data of the cell lines
    HCC1395 / HCC1395BL (SEQC2), delivered under /genomes in the simulator;
  * HPO terms and identifiers (Human Phenotype Ontology, public).
No row describes a real person. Replace or extend these files to change the data:
the column names must be those of data/labkey/schema/<release>.json (columns that
are not in a file stay empty). An instructor can also load a table's rows from a
TSV file in Settings > Data browser tables.
"""
import csv
import json
import os
import random
import datetime as dt

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
OUT = os.path.join(ROOT, "data", "labkey", "data")
SEED = 20261021

MP = "main-programme_v19_2024-10-31"
GMS = "nhs-gms-release_v5_2025-08-28"

RD_DISEASES = [
    # normalised_disease_group, normalised_disease_sub_group, normalised_specific_disease, HPO terms
    ("Neurology and neurodevelopmental disorders", "Neurodevelopmental disorders", "Intellectual disability",
     [("HP:0001249", "Intellectual disability"), ("HP:0001263", "Global developmental delay"), ("HP:0000252", "Microcephaly"), ("HP:0001250", "Seizure")]),
    ("Neurology and neurodevelopmental disorders", "Movement disorders", "Hereditary ataxia",
     [("HP:0001251", "Ataxia"), ("HP:0001260", "Dysarthria"), ("HP:0000640", "Gaze-evoked nystagmus"), ("HP:0001272", "Cerebellar atrophy")]),
    ("Neurology and neurodevelopmental disorders", "Neuromuscular disorders", "Charcot-Marie-Tooth disease",
     [("HP:0003693", "Distal amyotrophy"), ("HP:0001761", "Pes cavus"), ("HP:0002936", "Distal sensory impairment"), ("HP:0001284", "Areflexia")]),
    ("Neurology and neurodevelopmental disorders", "Epilepsy", "Genetic epilepsy syndromes",
     [("HP:0001250", "Seizure"), ("HP:0011097", "Epileptic spasm"), ("HP:0001263", "Global developmental delay")]),
    ("Ophthalmological disorders", "Posterior segment abnormalities", "Rod-cone dystrophy",
     [("HP:0000510", "Rod-cone dystrophy"), ("HP:0000662", "Nyctalopia"), ("HP:0001133", "Constriction of peripheral visual field")]),
    ("Renal and urinary tract disorders", "Cystic kidney disease", "Cystic kidney disease",
     [("HP:0000113", "Polycystic kidney dysplasia"), ("HP:0000822", "Hypertension"), ("HP:0012622", "Chronic kidney disease")]),
    ("Cardiovascular disorders", "Cardiomyopathy", "Hypertrophic cardiomyopathy",
     [("HP:0001639", "Hypertrophic cardiomyopathy"), ("HP:0001653", "Mitral regurgitation"), ("HP:0004308", "Ventricular arrhythmia")]),
    ("Haematological and immunological disorders", "Immune disorders", "Primary immunodeficiency",
     [("HP:0002721", "Immunodeficiency"), ("HP:0002205", "Recurrent respiratory infections"), ("HP:0004313", "Decreased circulating antibody level")]),
    ("Skeletal disorders", "Skeletal dysplasias", "Skeletal dysplasia",
     [("HP:0004322", "Short stature"), ("HP:0002652", "Skeletal dysplasia"), ("HP:0000944", "Abnormality of the metaphysis")]),
    ("Metabolic disorders", "Mitochondrial disorders", "Mitochondrial disorders",
     [("HP:0003128", "Lactic acidosis"), ("HP:0003198", "Myopathy"), ("HP:0001250", "Seizure")]),
    ("Dermatological disorders", "Ichthyosis", "Congenital ichthyosis",
     [("HP:0008064", "Ichthyosis"), ("HP:0000962", "Hyperkeratosis"), ("HP:0001053", "Hypopigmented skin patches")]),
    ("Endocrine disorders", "Diabetes", "Monogenic diabetes",
     [("HP:0000819", "Diabetes mellitus"), ("HP:0001998", "Neonatal hypoglycemia"), ("HP:0001513", "Obesity")]),
]

ETHNIC = ["White: British"] * 9 + ["White: Any other White background", "Asian or Asian British: Indian", "Asian or Asian British: Pakistani",
          "Black or Black British: African", "Black or Black British: Caribbean", "Mixed: White and Asian", "Not Stated"]
GMCS = [("RGT", "Cambridge University Hospitals"), ("RTD", "Newcastle upon Tyne Hospitals"), ("RJ1", "Guy's and St Thomas'"),
        ("RQ3", "Birmingham Women's and Children's"), ("RRV", "University College London Hospitals"), ("RW3", "Manchester University")]

CANCER = [
    # (participant_id, disease_type, sub_type, sex, yob, study)
    ("219000001", "BREAST", "DUCTAL", "Female", 1958, "Breast cancer"),
    ("219000002", "COLORECTAL", "ADENOCARCINOMA", "Male", 1949, "Colorectal cancer"),
    ("219000003", "LUNG", "ADENOCARCINOMA", "Female", 1961, "Lung cancer"),
    ("219000004", "RENAL", "CLEAR_CELL", "Male", 1955, "Renal cancer"),
]


def iso(d):
    return d.strftime("%Y-%m-%d")


def write(folder, tables):
    d = os.path.join(OUT, folder)
    os.makedirs(d, exist_ok=True)
    index = {"synthetic": True,
             "note": "Synthetic training data written by tools/make_demo_data.py. No row describes a real person.",
             "tables": {}}
    for name, rows in tables.items():
        if not rows:
            continue
        cols = list(rows[0].keys())
        for r in rows:
            for k in r:
                if k not in cols:
                    cols.append(k)
        path = os.path.join(d, name + ".tsv")
        with open(path, "w", newline="") as fh:
            w = csv.writer(fh, delimiter="\t", lineterminator="\n")
            w.writerow(cols)
            for r in rows:
                w.writerow(["" if r.get(c) is None else r.get(c) for c in cols])
        index["tables"][name] = name + ".tsv"
        print(f"  {folder}/{name}.tsv: {len(rows)} rows")
    with open(os.path.join(d, "index.json"), "w") as fh:
        json.dump(index, fh, indent=2)


def check(schema_file, tables):
    """Every column must exist in the release's schema, and coded values must be allowed values."""
    schema = json.load(open(os.path.join(ROOT, "data", "labkey", "schema", schema_file)))
    by = {t["name"]: {c["name"]: c for c in t["columns"]} for t in schema["tables"]}
    for name, rows in tables.items():
        assert name in by, f"unknown table {name}"
        for r in rows:
            for k, v in r.items():
                assert k in by[name], f"{name}: unknown column {k}"
                c = by[name][k]
                if v not in (None, "") and c.get("values"):
                    allowed = {str(x[0]) for x in c["values"]}
                    assert str(v) in allowed, f"{name}.{k}: {v!r} is not one of {sorted(allowed)[:8]}"


def main_programme(rnd):
    participants, summary, families, diseases, phenotypes, rda = [], [], [], [], [], []
    pid = 119000001
    fid = 119100001
    for i, (group, sub, specific, hpos) in enumerate(RD_DISEASES):
        family_id = str(fid + i)
        gmc = rnd.choice(GMCS)
        consent = dt.date(2015, 6, 1) + dt.timedelta(days=rnd.randrange(0, 1100))
        proband_sex = rnd.choice(["Female", "Male"])
        members = [("Proband", None, proband_sex, rnd.randrange(1990, 2014))]
        mother_yob = members[0][3] - rnd.randrange(22, 40)
        father_yob = mother_yob - rnd.randrange(-3, 8)
        members.append(("Relative", "Mother", "Female", mother_yob))
        members.append(("Relative", "Father", "Male", father_yob))
        if rnd.random() < 0.35:
            members.append(("Relative", "Full Sibling", rnd.choice(["Female", "Male"]), members[0][3] + rnd.randrange(-6, 7)))
        families.append({"rare_diseases_family_id": family_id, "rare_diseases_family_sk": 50000 + i,
                         "family_group_type": "Families with more than three Participants" if len(members) > 3 else "Trio with Mother and Father",
                         "family_medical_review_date": iso(consent + dt.timedelta(days=rnd.randrange(60, 400)))})
        eth = rnd.choice(ETHNIC)
        onset_age = min(rnd.choice([0, 1, 2, 4, 7, 12, 25, 35]), max(0, consent.year - members[0][3] - 1))
        for k, (ptype, rel, sex, yob) in enumerate(members):
            p = str(pid)
            pid += 1
            affected = ptype == "Proband" or (rel == "Full Sibling" and rnd.random() < 0.5)
            participants.append({
                "participant_id": p, "participant_sk": pid, "programme": "Rare Diseases", "gel_case_programme_id": "2",
                "participant_type": ptype, "biological_relationship_to_proband": rel,
                "rare_diseases_family_id": family_id, "rare_diseases_family_sk": 50000 + i,
                "participant_phenotypic_sex": sex, "participant_stated_gender": sex,
                "participant_karyotypic_sex": "XX" if sex == "Female" else "XY",
                "year_of_birth": yob, "participant_ethnic_category": eth,
                "date_of_consent": iso(consent), "registration_date": iso(consent - dt.timedelta(days=rnd.randrange(5, 60))),
                "programme_consent_status": "Consenting", "participant_pipeline_status": "Germline DNA Sample Created",
                "handling_gmc_ods_code": gmc[0], "handling_gmc_trust": gmc[1], "consanguinity": rnd.choice(["N", "N", "N", "U", "Y"]),
                "father_affected": "2", "mother_affected": "No", "penetrance": "Unknown" if ptype == "Proband" else None,
                "secondary_data_received_until_year": 2023,
            })
            summary.append({
                "participant_id": p, "participant_stated_gender": sex, "participant_phenotyped_sex": sex,
                "participant_karyotyped_sex": "XX" if sex == "Female" else "XY", "yob": yob,
                "programme": "Rare Diseases", "participant_type": "rd_proband" if ptype == "Proband" else "rd_relative",
                "affection_status": "affected" if affected else "unaffected",
                "date_of_consent": iso(consent),
                "normalised_disease_group": group if ptype == "Proband" else None,
                "normalised_disease_sub_group": sub if ptype == "Proband" else None,
                "normalised_specific_disease": specific if ptype == "Proband" else None,
                "rare_disease_diagnosis_age": onset_age if ptype == "Proband" else None,
            })
            rda.append({
                "participant_id": p, "plate_key": None, "rare_diseases_family_id": family_id,
                "biological_relationship_to_proband": rel, "participant_type": ptype, "participant_phenotypic_sex": sex,
                "participant_ethnic_category": eth, "normalised_specific_disease": specific if ptype == "Proband" else None,
                "genome": "Not Available", "genome_build": "N/A", "tiering": "Not Available",
                "inferred_sex_karyotype": "XX" if sex == "Female" else "XY", "genetic_vs_reported_results": "N/A",
            })
            if ptype == "Proband":
                diseases.append({"participant_id": p, "participant_sk": pid, "disease_group": group, "disease_sub_group": sub,
                                 "specific_disease": specific, "normalised_disease_group": group, "normalised_disease_sub_group": sub,
                                 "normalised_specific_disease": specific, "age_of_onset": onset_age, "normalised_age_of_onset": onset_age})
                for hpo_id, term in hpos:
                    if rnd.random() < 0.85:
                        phenotypes.append({"participant_id": p, "participant_sk": pid, "hpo_id": hpo_id, "hpo_term": term,
                                           "normalised_hpo_id": hpo_id, "normalised_hpo_term": term, "hpo_present": "Yes",
                                           "hpo_build_number": "v2019-02-12", "phenotype_report_date": iso(consent)})
                phenotypes.append({"participant_id": p, "participant_sk": pid, "hpo_id": "HP:0000365", "hpo_term": "Hearing impairment",
                                   "normalised_hpo_id": "HP:0000365", "normalised_hpo_term": "Hearing impairment", "hpo_present": "No",
                                   "hpo_build_number": "v2019-02-12", "phenotype_report_date": iso(consent)})

    # cancer participants (219000001: the donor of the HCC1395 / HCC1395BL genomes under /genomes)
    cancer_rows, files = [], []
    for k, (p, dtype, sub, sex, yob, study) in enumerate(CANCER):
        gmc = rnd.choice(GMCS)
        consent = dt.date(2016, 3, 1) + dt.timedelta(days=rnd.randrange(0, 700))
        diag = consent - dt.timedelta(days=rnd.randrange(20, 120))
        participants.append({
            "participant_id": p, "participant_sk": 900000 + k, "programme": "Cancer", "gel_case_programme_id": "1",
            "participant_type": "Proband", "participant_phenotypic_sex": sex, "participant_stated_gender": sex,
            "participant_karyotypic_sex": "XX" if sex == "Female" else "XY", "year_of_birth": yob,
            "participant_ethnic_category": rnd.choice(ETHNIC), "date_of_consent": iso(consent),
            "registration_date": iso(consent - dt.timedelta(days=10)), "programme_consent_status": "Consenting",
            "participant_pipeline_status": "Tumour DNA Sample Created", "handling_gmc_ods_code": gmc[0], "handling_gmc_trust": gmc[1],
            "secondary_data_received_until_year": 2023,
        })
        summary.append({
            "participant_id": p, "participant_stated_gender": sex, "participant_phenotyped_sex": sex,
            "participant_karyotyped_sex": "XX" if sex == "Female" else "XY", "yob": yob, "programme": "Cancer",
            "participant_type": "cancer_participant", "affection_status": "affected", "date_of_consent": iso(consent), "cancer_diagnosis_date": iso(diag),
            "cancer_diagnosis_age": diag.year - yob, "cancer_study_name": study, "cancer_disease_type": dtype, "cancer_disease_sub_type": sub,
        })
    # the genome files that exist in the simulator (/genomes/by_date/2016-08-11/...)
    base = "/genomes/by_date/2016-08-11"
    normal = f"{base}/HX00100001/LP3000001-DNA_A01"
    tumour = f"{base}/HX00100002/LP3000002-DNA_B01"
    files += [
        {"participant_id": "219000001", "platekey": "LP3000001-DNA_A01", "delivery_type": "cancer germline", "delivery_id": "HX00100001",
         "delivery_date": "2016-08-11", "delivery_version": "V4", "genome_build": "GRCh38", "type": "cancer germline",
         "file_type": "Assembly", "file_sub_type": "BAM", "file_path": f"{normal}/Assembly/LP3000001-DNA_A01.bam", "filename": "LP3000001-DNA_A01.bam"},
        {"participant_id": "219000001", "platekey": "LP3000002-DNA_B01", "delivery_type": "cancer somatic", "delivery_id": "HX00100002",
         "delivery_date": "2016-08-11", "delivery_version": "V4", "genome_build": "GRCh38", "type": "cancer somatic",
         "file_type": "Assembly", "file_sub_type": "BAM", "file_path": f"{tumour}/Assembly/LP3000002-DNA_B01.bam", "filename": "LP3000002-DNA_B01.bam"},
        {"participant_id": "219000001", "platekey": "LP3000002-DNA_B01", "delivery_type": "cancer somatic", "delivery_id": "HX00100002",
         "delivery_date": "2016-08-11", "delivery_version": "V4", "genome_build": "GRCh38", "type": "cancer somatic",
         "file_type": "Variations", "file_sub_type": "Standard VCF", "file_path": f"{tumour}/Variations/LP3000002-DNA_B01.somatic.vcf", "filename": "LP3000002-DNA_B01.somatic.vcf"},
    ]
    cancer_rows.append({
        "participant_id": "219000001", "tumour_sample_platekey": "LP3000002-DNA_B01", "germline_sample_platekey": "LP3000001-DNA_A01",
        "disease_type": "BREAST", "disease_sub_type": "DUCTAL", "sex": "FEMALE", "year_of_birth": 1958, "study_abbreviation": "BRC",
        "study_name": "Breast cancer", "germline_delivery_id": "HX00100001", "tumour_delivery_id": "HX00100002",
        "tumour_delivery_date": "2016-08-11", "germline_delivery_date": "2016-08-11", "tumour_purity": 70,
        "tumour_autosomal_coverage": 98.4, "germline_autosomal_coverage": 34.1, "somatic_coding_variants_per_mb": 6.2,
        "tumour_bam": f"{tumour}/Assembly/LP3000002-DNA_B01.bam", "germline_bam": f"{normal}/Assembly/LP3000001-DNA_A01.bam",
        "somatic_small_variants_vcf_path": f"{tumour}/Variations/LP3000002-DNA_B01.somatic.vcf",
    })
    return {
        "participant": participants, "participant_summary": summary, "rare_diseases_family": families,
        "rare_diseases_participant_disease": diseases, "rare_diseases_participant_phenotype": phenotypes,
        "rare_disease_analysis": rda, "cancer_analysis": cancer_rows, "genome_file_paths_and_types": files,
    }


def gms(rnd):
    participants, referrals, rp, observations, conditions = [], [], [], [], []
    indications = [("R29", "Intellectual disability", ("HP:0001249", "Intellectual disability")),
                   ("R59", "Early onset or syndromic epilepsy", ("HP:0001250", "Seizure")),
                   ("R134", "Familial hypercholesterolaemia", ("HP:0003124", "Hypercholesterolemia")),
                   ("R193", "Cystic renal disease", ("HP:0000107", "Renal cyst"))]
    n = 1
    for i, (code, name, (hpo, term)) in enumerate(indications):
        ref = f"r9900000000{i + 1}"
        referrals.append({"referral_id": ref, "category": "rare_diseases", "clinical_indication_code": code,
                          "clinical_indication_full_name": name, "date_submitted": iso(dt.date(2022, 3, 1) + dt.timedelta(days=rnd.randrange(0, 700))),
                          "priority": "routine", "status": "completed"})
        for rel in ["Proband", "Mother", "Father"]:
            p = f"p9900000{n:04d}"
            n += 1
            sex = "female" if rel == "Mother" else "male" if rel == "Father" else rnd.choice(["female", "male"])
            participants.append({"participant_id": p, "referral_id": ref, "category": "rare disease", "administrative_gender": sex,
                                 "phenotypic_sex": sex, "karyotypic_sex": "XX" if sex == "female" else "XY", "ethnicity": "A",
                                 "ethnicity_description": "White - British", "participant_year_of_birth": rnd.randrange(1965, 2020),
                                 "life_status": "alive", "participant_is_foetal_participant": "false"})
            rp.append({"participant_id": p, "referral_id": ref, "referral_participant_is_proband": "true" if rel == "Proband" else "false",
                       "relationship_to_proband": None if rel == "Proband" else rel, "disease_status": "affected" if rel == "Proband" else "unaffected"})
            if rel == "Proband":
                observations.append({"participant_id": p, "uid": f"obs{n:05d}", "code": hpo, "code_description": term,
                                     "normalised_hpo_id": hpo, "normalised_hpo_term": term, "value_code": "present"})
    return {"participant": participants, "referral": referrals, "referral_participant": rp, "observation": observations}


def main():
    rnd = random.Random(SEED)
    mp = main_programme(rnd)
    check("main-programme_v19_2024-10-31.json", mp)
    write(MP, mp)
    g = gms(rnd)
    check("nhs-gms-release_v5_2025-08-28.json", g)
    write(GMS, g)


if __name__ == "__main__":
    main()
