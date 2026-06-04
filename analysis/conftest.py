"""Make the local des_analysis package importable when running pytest."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
