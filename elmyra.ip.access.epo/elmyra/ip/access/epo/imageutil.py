# -*- coding: utf-8 -*-
# (c) 2011 ***REMOVED***
# (c) 2013-2015 Andreas Motl, Elmyra UG <andreas.motl@elmyra.de>
import os
import logging
import StringIO
import subprocess
import datetime
from tempfile import NamedTemporaryFile
from cornice.util import to_list


log = logging.getLogger(__name__)

def gif_to_tiff(payload):

    # debugging
    delete = True

    infile = NamedTemporaryFile(prefix='tmp-gif_to_tiff-', delete=delete)
    infile.write(payload)
    infile.flush()

    outfile_name = infile.name + '-out'

    command = ['gif2tiff', infile.name, outfile_name]
    command_string = ' '.join(command)

    proc = subprocess.Popen(
        command,
        shell = (os.name == 'nt'),
        stdin = subprocess.PIPE,
        stdout = subprocess.PIPE,
        stderr = subprocess.PIPE,
    )

    stdout = stderr = ''

    try:
        stdout, stderr = proc.communicate()
        if proc.returncode is not None and proc.returncode != 0:
            raise Exception('GIF to TIFF conversion failed')

        payload = file(outfile_name, 'rb').read()
        os.unlink(outfile_name)
        return payload

    except:
        log.error('GIF to TIFF conversion failed. returncode={returncode}, command="{command_string}", stdout={stdout}, stderr={stderr}'.format(returncode=proc.returncode, **locals()))
        raise Exception('GIF to TIFF conversion failed')


def to_png(tiff_payload, format='tif'):

    # unfortunately, PIL can not handle G4 compression ...
    # Failure: exceptions.IOError: decoder group4 not available
    # maybe patch: http://mail.python.org/pipermail/image-sig/2003-July/002354.html
    """
    import Image
    png = StringIO.StringIO()
    try:
        Image.open(StringIO.StringIO(tiff_payload)).save(png, 'PNG')
        png.seek(0)
    except Exception, e:
        print "ERROR (PIL+G4)!", e
        pass
    """


    # ... so use ImageMagick! ;-(
    # http://www.imagemagick.org/pipermail/magick-users/2003-May/008869.html
    #convert_bin = os.path.join(os.path.dirname(__file__), 'imagemagick', 'convert.exe')
    #command = ['convert', 'tif:-', '+set', 'date:create', '+set', 'date:modify', 'png:-']
    command = ['convert', '{0}:-'.format(format),
                '+set', 'date:create', '+set', 'date:modify',
                # FIXME: make this configurable
                '-resize', '457x',
                '-colorspace', 'rgb', '-flatten', '-depth', '8',
                '-antialias', '-quality', '100', '-density', '300',
                #'-level', '30%,100%',
                'png:-']

    command_debug = ' '.join(command)

    proc = subprocess.Popen(
        command,
        shell = (os.name == 'nt'),
        #shell = True,
        stdin = subprocess.PIPE,
        stdout = subprocess.PIPE,
        stderr = subprocess.PIPE,
    )

    stdout = stderr = ''

    try:
        stdout, stderr = proc.communicate(tiff_payload)
        if proc.returncode is not None and proc.returncode != 0:
            raise Exception('TIFF to PNG conversion failed')
    except:
        log.error('TIFF to PNG conversion failed, {1}. returncode={2}, command="{0}"'.format(command_debug, stderr, proc.returncode))
        raise Exception('TIFF to PNG conversion failed')

    if 'ImageMagick' in stdout[:200]:
        log.error('TIFF to PNG conversion failed, stdout={1}, stderr={1}. command="{0}"'.format(command_debug, stdout, stderr))
        raise Exception('TIFF to PNG conversion failed')

    return stdout


def png_resize(png_payload, width):

    image = Image.open(StringIO.StringIO(png_payload)).convert('RGB')

    image_width = image.size[0]
    image_height = image.size[1]

    #aspect = float(image_width) / float(image_height)
    #print "aspect:", aspect

    scale_factor = float(image_width) / float(width)
    #print "scale_factor:", scale_factor

    #size = (int(width), int(image_height * aspect))
    size = (int(width), int(image_height / scale_factor))
    #print "size:", size
    print "Resizing image from %s to %s" % (image.size, size)

    image.thumbnail(size, Image.ANTIALIAS)
    #image.resize(size, Image.ANTIALIAS)
    #print "thumbnail done"

    png = StringIO.StringIO()
    image.save(png, 'PNG')
    #print "image saved to memory"

    png_payload_resized = png.getvalue()
    #print "got payload"

    return png_payload_resized


def pdf_join(pages):
    # pdftk in1.pdf in2.pdf cat output out1.pdf
    # pdftk in.pdf dump_data output report.txt
    # pdftk in.pdf update_info in.info output out.pdf
    # pdftk in.pdf update_info_utf8 in.info output out.pdf
    # pdftk in.pdf attach_files table1.html table2.html to_page 6 output out.pdf

    command = [
        get_pdftk_path(),
    ]
    tmpfiles = []
    for page in pages:
        tmpfile = NamedTemporaryFile()
        tmpfile.write(page)
        tmpfile.flush()

        tmpfiles.append(tmpfile)
        command.append(tmpfile.name)

    command += ['cat', 'output', '-']

    #log.info('command={0}'.format(' '.join(command)))

    cmddebug = ' '.join(command)
    stdout = stderr = ''

    try:
        proc = subprocess.Popen(
            command,
            shell = (os.name == 'nt'),
            #shell = True,
            stdin = subprocess.PIPE,
            stdout = subprocess.PIPE,
            stderr = subprocess.PIPE,
        )

        stdout, stderr = proc.communicate()
        if proc.returncode is not None and proc.returncode != 0:
            log.error('pdftk joining failed, command={0}, stderr={1}, returncode={2}'.format(cmddebug, stderr, proc.returncode))

    except Exception as ex:
        log.error('pdftk joining failed, command={0}, exception={1}, stderr={2}'.format(cmddebug, ex, stderr))
        raise

    return stdout


def pdf_set_metadata(pdf_payload, metadata):

    # scdsc
    # PDF Producer: BNS/PXI/BPS systems of the EPO
    # Content creator: -
    # Mod-date: -
    # Author: -
    # Subject: -
    # Title: EP        0666666A2 I
    pass

    tmpfile = NamedTemporaryFile(delete=False)
    tmpfile.write(metadata)
    tmpfile.flush()

    """
    command = [get_pdftk_path(), '-', 'dump_data', 'output', '-']
    proc = subprocess.Popen(
        command,
        shell = (os.name == 'nt'),
        #shell = True,
        stdin = subprocess.PIPE,
        stdout = subprocess.PIPE,
        stderr = subprocess.PIPE,
    )
    stdout, stderr = proc.communicate(pdf_payload)
    print stdout
    #sys.exit()
    """


    command = [get_pdftk_path(), '-', 'update_info', tmpfile.name, 'output', '-']

    #log.info('command={0}'.format(' '.join(command)))

    cmddebug = ' '.join(command)
    stdout = stderr = ''

    try:

        proc = subprocess.Popen(
            command,
            shell = (os.name == 'nt'),
            #shell = True,
            stdin = subprocess.PIPE,
            stdout = subprocess.PIPE,
            stderr = subprocess.PIPE,
        )

        stdout, stderr = proc.communicate(pdf_payload)
        if proc.returncode is not None and proc.returncode != 0:
            log.error('pdftk metadata store failed, command={0}, stderr={1}'.format(cmddebug, stderr))
            raise Exception()

    except Exception as ex:
        log.error('pdftk metadata store failed, command={0}, exception={1}, stderr={2}'.format(cmddebug, ex, stderr))
        raise

    return stdout


def pdf_make_metadata(title, producer, pagecount, page_sections=None):

    page_sections = page_sections and to_list(page_sections) or []

    date = pdf_now()

    tpl = """
InfoBegin
InfoKey: Title
InfoValue: {title}
InfoBegin
InfoKey: Producer
InfoValue: {producer}
InfoBegin
InfoKey: Creator
InfoValue:
InfoBegin
InfoKey: ModDate
InfoValue:
InfoBegin
InfoKey: CreationDate
InfoValue: {date}

NumberOfPages: {pagecount}
"""

    metadata = tpl.format(**locals())

    # https://stackoverflow.com/questions/2969479/merge-pdfs-with-pdftk-with-bookmarks/20333267#20333267
    bookmark_tpl = """
BookmarkBegin
BookmarkTitle: {title}
BookmarkLevel: {level}
BookmarkPageNumber: {start_page}
"""

    for page_section in page_sections:
        name = page_section['@name']
        start_page = page_section['@start-page']
        if name == 'SEARCH_REPORT':
            title = 'Search-report'
        else:
            title = name.title()
        level = 1

        metadata += bookmark_tpl.format(**locals())

    return metadata


def pdf_now():
    # D:20150220033046+01'00'
    now = datetime.datetime.now().strftime("D:%Y%m%d%H%M%S+01'00'")
    return now


def get_pdftk_path():
    return '/usr/local/bin/pdftk'
