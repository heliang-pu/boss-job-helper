from pathlib import Path

from docx import Document
from reportlab.pdfgen import canvas

from job_apply_assistant.resume_parser import ResumeParser


def write_docx(path: Path, text: str) -> None:
    document = Document()
    document.add_paragraph(text)
    document.save(path)


def write_pdf(path: Path, text: str) -> None:
    pdf = canvas.Canvas(str(path))
    pdf.drawString(72, 720, text)
    pdf.save()


def test_parse_docx_resume(tmp_path: Path) -> None:
    path = tmp_path / "resume.docx"
    write_docx(path, "张三 机器人算法工程师 Python ROS 机械臂 项目经验")

    profile = ResumeParser().parse(path)

    assert profile.file_name == "resume.docx"
    assert "机器人算法工程师" in profile.raw_text
    assert "Python" in profile.skills


def test_parse_pdf_resume(tmp_path: Path) -> None:
    path = tmp_path / "resume.pdf"
    write_pdf(path, "Li Engineer Python Robot Control")

    profile = ResumeParser().parse(path)

    assert profile.file_name == "resume.pdf"
    assert "Python" in profile.raw_text


def test_reject_unsupported_file(tmp_path: Path) -> None:
    path = tmp_path / "resume.txt"
    path.write_text("plain text", encoding="utf-8")

    try:
        ResumeParser().parse(path)
    except ValueError as exc:
        assert "Unsupported resume file type" in str(exc)
    else:
        raise AssertionError("unsupported file should raise ValueError")
