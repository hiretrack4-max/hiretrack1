"""Regression tests for the heuristic parsers (Module 1/6 JD + resume parsing).

These lock in the fixes for the QA defects found on 2026-07-12:
  * single-figure "N LPA" salaries were scaled 100,000x (backtracking bug);
  * the JD location label leaked trailing prose past a sentence boundary.

They use ``SimpleTestCase`` because the extractors are pure functions — no
database is touched, so the suite runs without creating a test DB.
"""
from django.test import SimpleTestCase

from core.parsing.extractor import _TOTAL_EXP_RE, HeuristicResumeExtractor
from core.parsing.job_extractor import HeuristicJobDescriptionExtractor


class JobDescriptionSalaryParsingTests(SimpleTestCase):
    """Salary figures keep their written unit; single figures match ranges."""

    def setUp(self):
        self.extract = HeuristicJobDescriptionExtractor().extract

    def test_single_lpa_figure_preserved_not_scaled(self):
        # Regression: "40 LPA" used to backtrack to "40 L" -> 4,000,000.
        r = self.extract("Salary: 40 LPA")
        self.assertEqual(r.salary_min, 40)
        self.assertEqual(r.salary_max, 40)

    def test_single_lpa_matches_range_scale(self):
        single = self.extract("CTC 10 LPA")
        rng = self.extract("Salary 10-15 LPA")
        self.assertEqual(single.salary_min, 10)
        self.assertEqual((rng.salary_min, rng.salary_max), (10, 15))

    def test_lakh_figure_preserved(self):
        self.assertEqual(self.extract("Compensation: 12 lakh").salary_min, 12)

    def test_currency_prefixed_figure_unscaled(self):
        self.assertEqual(self.extract("Budget $120,000 per annum").salary_min, 120000)


class JobDescriptionLocationParsingTests(SimpleTestCase):
    """The location label stops at the first clause/sentence boundary."""

    def setUp(self):
        self.extract = HeuristicJobDescriptionExtractor().extract

    def test_location_label_stops_at_sentence_boundary(self):
        # Regression: used to return "Hyderabad. CTC Rs".
        r = self.extract(
            "Location: Hyderabad. CTC Rs 12,00,000 per annum. 2 positions available."
        )
        self.assertEqual(r.location, "Hyderabad")
        self.assertEqual(r.number_of_openings, 2)

    def test_location_label_stops_at_comma(self):
        self.assertEqual(self.extract("Location: Bangalore, Karnataka").location, "Bangalore")


class ResumeExperienceParsingTests(SimpleTestCase):
    """A genuine long career is a correct extraction, not a false positive."""

    def test_stated_long_career_extracted(self):
        # "over 34 years of experience (1991-2025)" is a real 34-year career and
        # must still be extracted as 34 (guards against over-correcting this).
        m = _TOTAL_EXP_RE.search(
            "seasoned professional with over 34 years of experience (1991-2025)"
        )
        self.assertIsNotNone(m)
        self.assertEqual(m.group(1), "34")


class ResumeNameAddressParsingTests(SimpleTestCase):
    """Name/location fixes from the 5-sample QA pass (2026-07-13).

    * a section header glued onto the name line (multi-column PDFs) is stripped;
    * location comes from the contact header, not a workplace/education line;
    * the address mirrors that location (never a workplace/college address).
    """

    def setUp(self):
        self.extract = HeuristicResumeExtractor().extract

    def test_section_header_stripped_from_name(self):
        # Regression: table/sidebar PDF merged the name with the SUMMARY header
        # -> "Rohan Mehta SUMMARY".
        r = self.extract(
            "Rohan Mehta SUMMARY\nFinancial Analyst\nCONTACT\n"
            "Gurugram, India\n+91-9871123456\nrohan.mehta@gmail.com\n"
        )
        self.assertEqual(r.full_name, "Rohan Mehta")

    def test_location_from_header_not_workplace_line(self):
        # Regression: the address scan picked "Multi-brand retail, Pune" from an
        # experience bullet and reported Pune, though the header says Mumbai.
        text = (
            "PRIYA SHARMA\n"
            "Digital Marketing Manager\n"
            "Mumbai, India | +91-9822011456 | priya@gmail.com | linkedin.com/in/x\n"
            "PROFESSIONAL EXPERIENCE\n"
            "Senior Manager - BrightWave Mar 2022 - Present\n"
            "Multi-brand retail, Pune\n"
        )
        r = self.extract(text)
        self.assertEqual(r.current_location, "Mumbai")

    def test_address_mirrors_location(self):
        # Address must equal the current location, never a workplace address.
        text = (
            "Dr. Ananya Rao\nRegistered Nurse\n"
            "Bengaluru, India +91-9945122380 ananya@gmail.com\n"
            "PROFESSIONAL EXPERIENCE\n"
            "Senior ICU Nurse Fortis Hospital Apr 2021 - Present\n"
            "18-bed medical-surgical ICU, Bengaluru\n"
        )
        r = self.extract(text)
        self.assertEqual(r.current_location, "Bengaluru")
        self.assertEqual(r.address, r.current_location)
