from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "bonus" ALTER COLUMN "taux_commission" TYPE DECIMAL(10,2) USING "taux_commission"::DECIMAL(10,2);"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "bonus" ALTER COLUMN "taux_commission" TYPE DECIMAL(5,2) USING "taux_commission"::DECIMAL(5,2);"""


MODELS_STATE = (
    "eJztnVtv2zYUgP+K4Iehw7Ii9pKt85tsK6lWXzJb6YrOg0DLjKNGojyJahMM/e87pO4SpV"
    "qO09iOXtKE5KHIj9dzeMj+17KdJba81z2H+F6rK/3XIsjG8Es24kRqofU6CWYBFC0snnIR"
    "J1l41EUGhcAbZHkYgpbYM1xzTU2HQCjxLYsFOgYkNMkqCfKJ+a+PdeqsML3FLkT8/Q8Em2"
    "SJ77EX/bm+029MbC0zBTWX7Ns8XKcPax6mEnrBE7KvLXTDsXybJInXD/TWIXFqk1AWusIE"
    "u4hilj11fVZ8VrqwmlGNgpImSYIipmSW+Ab5Fk1Vd0MGhkMYPyhN0BIr9pWfO+2z387e/P"
    "Lr2RtIwksSh/z2NaheUvdAkBMYa62vPB5RFKTgGBNuHkUu1SEaF/kNIFQMMCuVA8mCqWnj"
    "11F8GmkEsIppFJBATTrSbqhWIBvImsKZJYwwWdYmlJY5dj586AfVKxDq3yJXIb7NKanwEU"
    "QMXKCVzSHHCwr2XSm1Rsp4dq0Mu5KNiedja07kmTZVYDApXQlBcTBwwnPSn4xG6mymTsZd"
    "yXBs2/Q8lsNm49pG97qFyYrewp/t0wri7+Vp/608fdU+/ZHl7cDkGky54zCmw6OybbLG7o"
    "3j2oy27hmOK+q82DBtZIn7r1A+35GDDF6HGW3QSOHkuCc9WemrI3n46vykw8F6/1omxWni"
    "ZwWssLhhQOLVWGzSIt9ecvYC2m4WnYSai2G9qLNAJwIvlNjahQVCD+cfHdmOH1S8zgguye"
    "I4B3G7zigmC/2T47ueHk/mNfqmWPiF9lOK/HuOo2bnzMgdaY88rdEjg8Ea96jHjHhRJkdK"
    "uM6YN5DuYmSZXt2dUFawIcmAOItP2KDmTX2UacmGZTAPZnWHurNoVvpImdaZSxMg202jQv"
    "kj5VqrrzoUbbkXzYs+muae2US2wbkEHce0BJrkH7PJWIwxJZIjeE2gNn8vTYOeSLBU0X8O"
    "rUeySrMy2x6wa6WMG69G8oe83aM/nPQ4BMejK5fnwjPo5RB7FFFfQHgzo1Qi/f0MUqB2mN"
    "Rku425f3qKf28VYMMmXNVUeajOlK6USz0nyliXNU0Za4o+bnclhUiIUgybQWn8UzsTPVCn"
    "Sl9TrqeZVAPTheUZ+2427WU20eWcvIcSDKAEV2zPKX2GMiyDMuA5mSp/KFoc5+JPmIZx29"
    "jGOpvYxjrltrFOcYGA/Rw0m45E01honC1ZGjKSVXZd9st+zmMtqMNyQqyHcAqooKupI2Wm"
    "yaOrzMhkFmAW0+GhD7nQV7/mWiLORPpL1d5K7E/p42Ss5AdwnE772GJlQj51dOJ80dEyda"
    "4ShUZgMg3rr5dbNmxWsmnYZ23YsPDFAbt40Gud8xXktrLSPEdT7thMg+215TxgXA9fTuol"
    "wWPnzDd3whPTiEoR5IXjYnNF3uGHwsYixy48VldSWe0fx69Rf4hCk8Hqoi/xGXy+m0A1oX"
    "I42P725VlfHiitkuG8A4bXHv6+x4M751eYpcQEWZdcIOPuC3KXeknf5PswxAoq2PX2QuGL"
    "d1Ns8UTlVN/HGR0WW07J6TgpOhluxSi7Y+dDEEErXmr2bfal/HAVeMikh3K5k0x67mj8ZP"
    "Zt0j+Ryv1kbATfN3yrxMVBzC8jtBsl8sk5ZnSv8010r/Ny3eu8ePSG7FoIo/TP7BOyJb/O"
    "+fkmyuv5ebn2yuLyhqM1cqmNRVa4zSwb2Rye292mP1SZlWGodKW+ZUKhuLHgjRV62CjTvi"
    "oP9csriHZsG7uGiSzp8ioTCxlMlaspN4qkUkFmLl67pgd5yYP3XQl+zMmFOlCG6kzWuOfO"
    "RWS5sEyPr3iQ9HqgMtOIzlx+pmPIU/aXJjOLSOxgzSWQ3UC+0PsT+OxkyI0o8Dd8Gb7HMr"
    "s5s7gNhSdi1hMey+wmfa0HJdR6czJ925Wmb+Fj0NAafMG4RXROer1ZV4IfQe300TvtMqgR"
    "gDZ48aQfpNEdXUHmE8h3Av/OVPhlpsJvkM9Am5Ph5FKdaeqf11DyobMyPcoaCeJZSS63Ms"
    "K0N+nH7fJu3G6MMEepqxeNMMH2ya2namaFGk0zTbJRkgodZHsNiXuaivz36mhHsTv84fB8"
    "UsWIG/pH6L4lUIziuErFiLuu2GGqRjHaszmqSjFqdqPNbvTwd6PNFYb9u8KwladJ42PSHI"
    "genZJVOBD1MK19GJqReUHu6hUKVoDk++lXz+Zx9U31KtM56mpXT6lacLICtSIiXq5S+FGK"
    "Rp3YsxFZpU6AEmhadQ4IYoFDPF95kvOB5ojl0QjZal2LYSywFcRnWFhfyDHVzsg2doEXaR"
    "cwPT30qXFcnbQFZmPHsTAiJet6UTrXixcg/lSzbN3dzua6aG8yGWYUpZ6q5Zhej3oK6Ps5"
    "TbXomQiIlpHPeX26GdEGbRGte7sF1ECowVnEudqC5qqBKXjfAHneFweUw1vkCbpoxUYrL9"
    "hsuJJXNpgWT507LLhHWk40J9bwFPDU8f3adEXHxtVW1JIsdmBO3avLe/tkPY2qXemj0jgf"
    "HYVdPGjYgoG38QOp8AMRXQt6JIbDvMZSfH8FlpRHkkg7u+zrBF4NorlB8pSnGSkogjONLL"
    "Lyk43P2XTN+cYu18Ynf28Vr+vszqP0h2mc3/39EejowndyygkmEofJcPfvHxBHdLih4fuy"
    "F++cgzrbqNrOKh+0zE628MpIvJsdTsaXUfL80yNZnLZDzRudP3NRh2pOrIErhBuudVvpan"
    "nZRlvbA22t6HVZayuRFnlJ10QEY8KpeccmL/aS8FU4gcX/ccEjfcAO0BhwkvMCSw+ubz/j"
    "EPenHcA7/AtK+dG1T050MnZN47YlUDnDmJMqdRMlaRpVc8/mtZMKVfMzdsVvipbrSimRA1"
    "WWnuIgiA2NGhDD5IcJsH262T2OqoscghdZCRX6gZU/dZkS2cFTl/t1lWNnb13WOPnY/fLy"
    "9X8wGDyX"
)
