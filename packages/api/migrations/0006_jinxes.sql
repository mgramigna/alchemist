CREATE TABLE jinxes (
  script_id TEXT NOT NULL REFERENCES scripts(id),
  first TEXT NOT NULL,
  second TEXT NOT NULL,
  explanation TEXT NOT NULL,
  PRIMARY KEY (script_id, first, second),
  CHECK (first < second),
  FOREIGN KEY (script_id, first) REFERENCES characters(script_id, id),
  FOREIGN KEY (script_id, second) REFERENCES characters(script_id, id)
);
